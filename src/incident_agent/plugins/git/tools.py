from typing import Optional

from langchain_core.tools import BaseTool, tool

from .repos import Repo, RepoError


def build_tools(repos: dict[str, Repo]) -> list[BaseTool]:
    """Read-only code tools over one or more repositories."""
    names = ", ".join(sorted(repos))

    def pick(repo: Optional[str]) -> list[Repo]:
        if repo:
            if repo not in repos:
                raise ValueError(f"Unknown repo {repo!r}. Available: {names}")
            return [repos[repo]]
        return list(repos.values())

    def single(repo: Optional[str]) -> Repo:
        if repo is None and len(repos) == 1:
            return next(iter(repos.values()))
        if repo is None:
            raise ValueError(f"Several repos are connected; pass repo (one of: {names})")
        return pick(repo)[0]

    @tool
    def search_code(pattern: str, repo: Optional[str] = None, path: Optional[str] = None,
                    regex: bool = False, ignore_case: bool = False, max_results: int = 30) -> list[dict]:
        """
        Search source code for text, e.g. the fixed part of a log message or an
        exception class name, to find where an error is raised or handled.

        Args:
            pattern: text to find (exact text unless regex=true).
            repo: repo name; omit to search every connected repo.
            path: optional pathspec to narrow the search, e.g. "src/**/*.java".
            regex: treat pattern as an extended regular expression.
            ignore_case: case-insensitive match.
            max_results: per repo, at most 100.

        Returns [{repo, file, line, text}].
        """
        results = []
        for item in pick(repo):
            try:
                matches = item.grep(pattern, fixed=not regex, ignore_case=ignore_case, pathspec=path, limit=min(max_results, 100))
            except RepoError as error:
                results.append({"repo": item.name, "error": str(error)})
                continue
            results.extend({"repo": item.name, **match} for match in matches)
        return results

    @tool
    def read_file(path: str, repo: Optional[str] = None, start_line: int = 1, end_line: Optional[int] = None) -> dict:
        """
        Read a file from a repo with line numbers (at most 400 lines per call).
        Use after search_code to see the code around a match.

        Args:
            path: file path inside the repo, as returned by search_code.
            repo: repo name; may be omitted when only one repo is connected.
            start_line, end_line: line range to read.
        """
        return single(repo).read(path, start_line, end_line)

    @tool
    def list_files(repo: Optional[str] = None, path: Optional[str] = None, max_results: int = 200) -> dict:
        """
        List files in a repo, optionally under a path or matching a pathspec
        such as "src/main/**/config/*".
        """
        files, total = single(repo).list_files(path, limit=min(max_results, 1000))
        return {"files": files, "total": total}

    @tool
    def recent_commits(repo: Optional[str] = None, path: Optional[str] = None, since: str = "7 days", max_results: int = 30) -> list[dict]:
        """
        Commits in a repo since a time ("2 days", "2026-11-20"), optionally only
        those touching a path. Use to check whether a change shipped shortly
        before an incident.
        """
        results = []
        for item in pick(repo):
            results.extend({"repo": item.name, **commit} for commit in item.commits(since, path, limit=min(max_results, 200)))
        return results

    return [search_code, read_file, list_files, recent_commits]
