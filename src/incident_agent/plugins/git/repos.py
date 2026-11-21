"""
Read-only access to Git repositories: a local checkout, or a remote one cloned
into a cache directory and refreshed periodically. Nothing is ever pushed, and
access tokens are passed per command, never written into the clone's config.
"""
import base64
import hashlib
import logging
import os
import shutil
import subprocess
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Iterator, Optional

try:  # POSIX; on other platforms only the in-process lock applies
    import fcntl
except ImportError:  # pragma: no cover
    fcntl = None

logger = logging.getLogger(__name__)

GIT_TIMEOUT = 120
MAX_LINE_CHARS = 300


class RepoError(RuntimeError):
    pass


# The agent (and its Repo objects) is rebuilt for every investigation, so the
# lock must belong to the checkout folder, not to a Repo instance.
_folder_locks: dict[str, Lock] = {}
_folder_locks_guard = Lock()


@contextmanager
def checkout_lock(root: Path) -> Iterator[None]:
    """
    Serialize clone/refresh of one checkout folder: across threads of this
    process, and across processes (e.g. the web server and the CLI) with a
    lock file next to the folder.
    """
    with _folder_locks_guard:
        lock = _folder_locks.setdefault(str(root), Lock())
    with lock:
        root.parent.mkdir(parents=True, exist_ok=True)
        with open(root.parent / f".{root.name}.lock", "w") as handle:
            if fcntl:
                fcntl.flock(handle, fcntl.LOCK_EX)
            try:
                yield
            finally:
                if fcntl:
                    fcntl.flock(handle, fcntl.LOCK_UN)


def explain(message: str) -> str:
    """Add the likely fix to git's terse access errors."""
    lowered = message.lower()
    if "error: 403" in lowered or "not found" in lowered or "repository" in lowered and "does not exist" in lowered:
        return (
            f"{message} — the token can't read this repository. For an organization's repo, "
            "create the token with the organization as resource owner (fine-grained token), select "
            "the repository with Contents: Read, and check it isn't pending the organization's approval "
            "or SSO authorization."
        )
    if "error: 401" in lowered or "authentication failed" in lowered or "could not read username" in lowered:
        return f"{message} — no valid credentials: add an access token, or check that it hasn't expired."
    return message


@dataclass
class Repo:
    name: str
    description: str = ""
    # remote source
    url: Optional[str] = None
    branch: Optional[str] = None
    username: Optional[str] = None
    token: Optional[str] = None
    history_days: int = 30
    refresh_minutes: int = 15
    # local source
    path: Optional[str] = None
    cache_dir: str = "~/.incident-agent/repos"

    # -- location ---------------------------------------------------------------

    @property
    def is_remote(self) -> bool:
        return bool(self.url)

    @property
    def root(self) -> Path:
        if not self.is_remote:
            return Path(self.path or "").expanduser().resolve()
        # One checkout per URL + branch; the name keeps the folder readable.
        digest = hashlib.sha1(f"{self.url}#{self.branch or ''}".encode()).hexdigest()[:10]
        return Path(self.cache_dir).expanduser() / f"{self.name}-{digest}"

    # -- git plumbing -----------------------------------------------------------

    def _auth_args(self) -> list[str]:
        if not (self.is_remote and self.token):
            return []
        credentials = base64.b64encode(f"{self.username or 'x-access-token'}:{self.token}".encode()).decode()
        # Command-line config is not persisted to .git/config.
        return ["-c", f"http.extraHeader=Authorization: Basic {credentials}"]

    def _git(self, *args: str, cwd: Optional[Path] = None, check: bool = True, timeout: int = GIT_TIMEOUT) -> subprocess.CompletedProcess:
        command = ["git", *self._auth_args(), *args]
        env = {"GIT_TERMINAL_PROMPT": "0", "PATH": "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin"}
        try:
            result = subprocess.run(command, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)
        except subprocess.TimeoutExpired as error:
            raise RepoError(f"git {args[0]} timed out after {timeout}s") from error
        if check and result.returncode not in (0,):
            message = (result.stderr or result.stdout).strip().splitlines()
            raise RepoError(explain(message[-1] if message else f"git {args[0]} failed"))
        return result

    def _is_git(self, root: Path) -> bool:
        return (root / ".git").exists() or self._git("rev-parse", "--git-dir", cwd=root, check=False).returncode == 0

    # -- checkout ---------------------------------------------------------------

    def ls_remote(self) -> list[str]:
        """Branch names of a remote repo; verifies URL and credentials."""
        output = self._git("ls-remote", "--heads", self.url, timeout=30).stdout
        return [line.split("refs/heads/", 1)[1] for line in output.splitlines() if "refs/heads/" in line]

    def ensure(self) -> Path:
        """The repo's working tree, cloning or refreshing a remote one when stale."""
        root = self.root
        if not self.is_remote:
            if not root.is_dir():
                raise RepoError(f"Local path {root} does not exist")
            return root

        stamp = root / ".git" / "incident-agent-fetched"
        if self._fresh(stamp):
            return root  # common case: no lock, no network
        with checkout_lock(root):
            # Another request may have cloned or refreshed while we waited.
            if self._fresh(stamp):
                return root
            if not (root / ".git").exists():
                self._clone(root)
            else:
                self._refresh(root)
            stamp.touch()
        return root

    def _fresh(self, stamp: Path) -> bool:
        return stamp.exists() and time.time() - stamp.stat().st_mtime < self.refresh_minutes * 60

    def _history_args(self) -> list[str]:
        return [f"--shallow-since={self.history_days} days ago"] if self.history_days else ["--depth=1"]

    def _clone(self, root: Path) -> None:
        # Clone next to the target and rename when complete, so a half-finished
        # clone is never visible at `root`.
        staging = root.with_name(f".{root.name}.cloning-{os.getpid()}")
        shutil.rmtree(staging, ignore_errors=True)
        branch = ["--branch", self.branch] if self.branch else []
        base = ["clone", "--single-branch", "--no-tags", *branch]
        logger.info("Cloning %s into %s", self.name, root)
        result = self._git(*base, *self._history_args(), self.url, str(staging), check=False)
        if result.returncode != 0 and "shallow" in (result.stderr or ""):
            # No commits inside the history window: fall back to the latest commit.
            shutil.rmtree(staging, ignore_errors=True)
            result = self._git(*base, "--depth=1", self.url, str(staging), check=False)
        if result.returncode != 0:
            shutil.rmtree(staging, ignore_errors=True)
            lines = (result.stderr or "").strip().splitlines()
            raise RepoError(explain(lines[-1] if lines else "git clone failed"))
        shutil.rmtree(root, ignore_errors=True)  # leftovers of an interrupted run
        os.replace(staging, root)

    def _refresh(self, root: Path) -> None:
        branch = self.branch or self._git("rev-parse", "--abbrev-ref", "HEAD", cwd=root).stdout.strip()
        result = self._git("fetch", "--no-tags", *self._history_args(), "origin", branch, cwd=root, check=False)
        if result.returncode != 0:
            result = self._git("fetch", "--no-tags", "--depth=1", "origin", branch, cwd=root, check=False)
        if result.returncode != 0:
            # Serve the existing checkout rather than failing the investigation.
            logger.warning("Could not refresh %s: %s", self.name, (result.stderr or "").strip()[-200:])
            return
        self._git("reset", "--hard", "FETCH_HEAD", cwd=root)

    # -- read operations ----------------------------------------------------------

    def resolve(self, relative: str) -> Path:
        """A path inside the repo; refuses anything that escapes it."""
        root = self.ensure().resolve()
        target = (root / relative.lstrip("/")).resolve()
        if root != target and root not in target.parents:
            raise RepoError("Path is outside the repository")
        return target

    def grep(self, pattern: str, *, fixed: bool, ignore_case: bool = False, pathspec: Optional[str] = None,
             exclude: tuple[str, ...] = (), limit: int = 30) -> list[dict]:
        root = self.ensure()
        args = ["grep", "-n", "-I", "--full-name", "--no-color", "-F" if fixed else "-E"]
        if ignore_case:
            args.append("-i")
        if not self._is_git(root):
            args.append("--no-index")
        args += ["-e", pattern, "--"]
        args += [pathspec] if pathspec else ["."] if exclude else []
        args += [f":(exclude){glob}" for glob in exclude]
        result = self._git(*args, cwd=root, check=False)
        if result.returncode not in (0, 1):
            raise RepoError((result.stderr or "git grep failed").strip().splitlines()[-1])
        matches = []
        for line in result.stdout.splitlines():
            file, _, rest = line.partition(":")
            number, _, text = rest.partition(":")
            if number.isdigit():
                matches.append({"file": file, "line": int(number), "text": text.strip()[:MAX_LINE_CHARS]})
            if len(matches) >= limit:
                break
        return matches

    def read(self, relative: str, start: int = 1, end: Optional[int] = None, max_lines: int = 400) -> dict:
        target = self.resolve(relative)
        if not target.is_file():
            raise RepoError(f"{relative} is not a file in {self.name}")
        lines = target.read_text(encoding="utf-8", errors="replace").splitlines()
        start = max(1, start)
        end = min(len(lines), end or start + max_lines - 1, start + max_lines - 1)
        return {
            "repo": self.name,
            "path": relative,
            "start": start,
            "end": end,
            "total_lines": len(lines),
            "content": "\n".join(f"{number:>5}  {lines[number - 1][:MAX_LINE_CHARS * 2]}" for number in range(start, end + 1)),
        }

    def list_files(self, pathspec: Optional[str] = None, limit: int = 200) -> tuple[list[str], int]:
        root = self.ensure()
        if self._is_git(root):
            output = self._git("ls-files", "--", *( [pathspec] if pathspec else []), cwd=root).stdout.splitlines()
        else:
            base = self.resolve(pathspec or ".")
            output = [str(p.relative_to(root)) for p in base.rglob("*") if p.is_file()]
        return output[:limit], len(output)

    def commits(self, since: str = "7 days", pathspec: Optional[str] = None, limit: int = 30) -> list[dict]:
        root = self.ensure()
        if not self._is_git(root):
            return []
        output = self._git(
            "log", f"--since={since} ago" if since[0].isdigit() else f"--since={since}", f"-n{limit}",
            "--date=iso-strict", "--pretty=format:%h%x1f%ad%x1f%an%x1f%s", "--", *([pathspec] if pathspec else []),
            cwd=root,
        ).stdout
        commits = []
        for line in output.splitlines():
            parts = line.split("\x1f")
            if len(parts) == 4:
                commits.append({"commit": parts[0], "date": parts[1], "author": parts[2], "subject": parts[3][:200]})
        return commits
