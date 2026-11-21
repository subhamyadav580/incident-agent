"""
Git plugin: read-only access to source code in one or more repositories.

Options (built from the stored connectors by the server):
    enabled: true
    cache_dir: ~/.incident-agent/repos      # where remote repos are cloned
    repos:
      - name: checkout
        description: Checkout service (Java, Spring)
        path: /srv/checkout                 # a local checkout, or:
        url: https://github.com/acme/checkout.git
        branch: main
        username: x-access-token            # with token, HTTPS basic auth
        token: ...
        history_days: 30                    # commits kept in the clone
        refresh_minutes: 15
    instructions: ""
"""
from ..base import Plugin
from .prefetch import CodePrefetcher
from .repos import Repo
from .tools import build_tools


def build_instructions(repos: dict[str, Repo], extra: str) -> str:
    lines = ["Read-only source code of these repositories:"]
    for repo in repos.values():
        lines.append(f"- `{repo.name}`: {repo.description or 'no description'}")
    lines += [
        "",
        "To find where an error comes from, search_code for the fixed text of the log "
        "message or the exception class name, then read_file around the match. Use "
        "recent_commits to check whether a change shipped shortly before the incident. "
        "Quote file paths and line numbers in the report.",
    ]
    if extra.strip():
        lines += ["", extra.strip()]
    return "\n".join(lines)


def create_plugin(options: dict) -> Plugin:
    cache_dir = options.get("cache_dir", "~/.incident-agent/repos")
    repos = {
        entry["name"]: Repo(
            name=entry["name"],
            description=entry.get("description", ""),
            url=entry.get("url") or None,
            branch=entry.get("branch") or None,
            username=entry.get("username") or None,
            token=entry.get("token") or None,
            history_days=int(entry.get("history_days", 30)),
            refresh_minutes=int(entry.get("refresh_minutes", 15)),
            path=entry.get("path") or None,
            cache_dir=cache_dir,
        )
        for entry in options.get("repos") or []
    }
    if not repos:
        raise RuntimeError("No repository configured. Add a Git connector.")

    prefetch_options = options.get("prefetch") or {}
    return Plugin(
        name="git",
        tools=build_tools(repos),
        instructions=build_instructions(repos, options.get("instructions", "")),
        prefetch=CodePrefetcher(repos) if prefetch_options.get("enabled", True) else None,
        prefetch_intents=("investigation",),
    )
