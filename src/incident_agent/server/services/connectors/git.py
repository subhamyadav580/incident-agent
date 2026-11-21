from pathlib import Path

from incident_agent.plugins.git.repos import Repo, RepoError

from ...core.config import get_settings
from ...schemas.connector import FieldSpec
from .base import COMMON_FIELDS, apply_defaults
from .errors import ConnectorInvalid

REMOTE = {"source": ["remote"]}
LOCAL = {"source": ["local"]}
URL_PREFIXES = ("https://", "http://", "ssh://", "git@")


class GitConnector:
    type = "git"
    label = "Git repository"
    description = "Read-only source code. The agent finds where an error is logged or thrown and what changed recently."
    plugin = "git"
    catalog_label = ""
    fields = [
        FieldSpec(name="source", label="Source", kind="select", default="remote", options=["remote", "local"],
                  help="remote: cloned read-only into the server's cache and refreshed. local: a checkout on the server machine."),
        FieldSpec(name="url", label="Repository URL", kind="text", show_if=REMOTE,
                  help="HTTPS URL, e.g. https://github.com/acme/checkout.git. SSH URLs use the server's SSH keys."),
        FieldSpec(name="branch", label="Branch", kind="text", show_if=REMOTE, help="Empty: the repository's default branch."),
        FieldSpec(name="username", label="Token username", kind="text", default="x-access-token", show_if=REMOTE,
                  help="GitHub: any value. GitLab: oauth2. Bitbucket: x-token-auth."),
        FieldSpec(name="token", label="Access token", kind="password", secret=True, show_if=REMOTE,
                  help="Read-only token, e.g. a GitHub fine-grained token with Contents: Read. Empty for public repos."),
        FieldSpec(name="path", label="Local path", kind="text", show_if=LOCAL,
                  help="Absolute path to the checkout on the machine running the server."),
        FieldSpec(name="description", label="What this code is", kind="textarea",
                  help="Shown to the agent, e.g. 'Checkout service (Java, Spring); logs go to checkout-service-logs'."),
        *COMMON_FIELDS,
        FieldSpec(name="history_days", label="Commit history kept (days)", kind="number", default=30, group="advanced",
                  show_if=REMOTE, help="How far back recent_commits can look in a cloned repo. 0 = latest commit only."),
        FieldSpec(name="refresh_minutes", label="Refresh every (minutes)", kind="number", default=15, group="advanced",
                  show_if=REMOTE, help="A cloned repo is fetched again when older than this."),
    ]

    def normalize(self, settings: dict, secrets: dict) -> dict:
        settings = apply_defaults(self.fields, settings)
        if settings["source"] == "remote":
            url = settings.get("url", "")
            if not url:
                raise ConnectorInvalid("Repository URL is required")
            if not url.startswith(URL_PREFIXES):
                raise ConnectorInvalid("Repository URL must start with https://, http://, ssh:// or git@")
            if "@" in url.split("://", 1)[-1].split("/", 1)[0] and url.startswith("http"):
                raise ConnectorInvalid("Put the token in the Access token field, not in the URL")
            settings.pop("path", None)
        else:
            path = settings.get("path", "")
            if not path or not Path(path).expanduser().is_absolute():
                raise ConnectorInvalid("Local path must be an absolute path")
            for key in ("url", "branch", "username", "history_days", "refresh_minutes"):
                settings.pop(key, None)
        return settings

    def repo(self, name: str, settings: dict, secrets: dict) -> Repo:
        return Repo(
            name=name,
            description=settings.get("description", ""),
            url=settings.get("url") if settings.get("source") == "remote" else None,
            branch=settings.get("branch") or None,
            username=settings.get("username") or None,
            token=secrets.get("token") or None,
            history_days=int(settings.get("history_days", 30)),
            refresh_minutes=int(settings.get("refresh_minutes", 15)),
            path=settings.get("path") if settings.get("source") == "local" else None,
            cache_dir=str(Path(get_settings().data_dir).expanduser() / "repos"),
        )

    def test(self, settings: dict, secrets: dict) -> str:
        repo = self.repo("test", settings, secrets)
        try:
            if repo.is_remote:
                branches = repo.ls_remote()
                if settings.get("branch") and settings["branch"] not in branches:
                    raise ConnectorInvalid(f"Branch {settings['branch']!r} not found")
                return f"Repository reachable; {len(branches)} branch{'es' if len(branches) != 1 else ''}."
            files, total = repo.list_files(limit=1)
            return f"Local checkout found at {repo.root}; {total} files."
        except RepoError as error:
            raise RuntimeError(str(error)) from error

    def list_objects(self, settings: dict, secrets: dict) -> tuple[list[dict], bool]:
        raise ConnectorInvalid("Git connectors have no catalog")

    def describe_object(self, settings: dict, secrets: dict, name: str) -> list[dict]:
        raise ConnectorInvalid("Git connectors have no catalog")

    def add_to_plugin(self, options: dict, name: str, settings: dict, secrets: dict) -> None:
        # One git plugin serves every repository connector.
        repo = self.repo(name, settings, secrets)
        options["cache_dir"] = repo.cache_dir
        options.setdefault("repos", []).append({
            "name": name,
            "description": repo.description,
            "url": repo.url,
            "branch": repo.branch,
            "username": repo.username,
            "token": repo.token,
            "history_days": repo.history_days,
            "refresh_minutes": repo.refresh_minutes,
            "path": repo.path,
        })
        if settings.get("instructions"):
            extra = options.get("instructions", "")
            options["instructions"] = f"{extra}\n\nRepository `{name}`: {settings['instructions']}".strip()
