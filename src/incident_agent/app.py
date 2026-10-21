import uuid
from pathlib import Path
from typing import Optional, Union

import yaml

from .harness.limits import ExecutionLimits
from .harness.runtime import AgentHarness
from .plugins import Plugin, load_plugins


def local_override_path(path: Union[str, Path]) -> Path:
    """configs/agent.yaml -> configs/agent.local.yaml"""
    path = Path(path)
    return path.with_name(f"{path.stem}.local{path.suffix}")


def deep_merge(base: dict, override: dict) -> dict:
    """Merge override into base: nested dicts merge, everything else replaces."""
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def load_config(path: Union[str, Path]) -> dict:
    """
    Load agent.yaml, then merge agent.local.yaml from the same directory on top
    if it exists. The local file is gitignored and holds per-developer settings.
    """
    config = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}

    local_path = local_override_path(path)
    if local_path.exists():
        config = deep_merge(config, yaml.safe_load(local_path.read_text(encoding="utf-8")) or {})

    return config


class IncidentAgent:
    """An AgentHarness plus the plugins it was built from."""

    def __init__(self, harness: AgentHarness, plugins: list[Plugin]):
        self.harness = harness
        self.plugins = plugins

    def investigate(self, message: str, run_id: Optional[str] = None) -> str:
        return self.harness.run(task=message, run_id=run_id or str(uuid.uuid4()))

    def close(self) -> None:
        for plugin in self.plugins:
            if plugin.close:
                plugin.close()

    def __enter__(self) -> "IncidentAgent":
        return self

    def __exit__(self, *exc) -> None:
        self.close()


def build_agent(config: dict) -> IncidentAgent:
    """
    Build an agent from a parsed agent.yaml.

    Tools come from every enabled plugin. `tools.enabled` optionally narrows
    them to an allowlist.
    """
    plugins = load_plugins(config.get("plugins"))

    tools = []
    seen = {}
    for plugin in plugins:
        for plugin_tool in plugin.tools:
            if plugin_tool.name in seen:
                raise ValueError(
                    f"Tool {plugin_tool.name!r} is provided by both "
                    f"{seen[plugin_tool.name]!r} and {plugin.name!r}"
                )
            seen[plugin_tool.name] = plugin.name
            tools.append(plugin_tool)

    allowed_tools = (config.get("tools") or {}).get("enabled") or [t.name for t in tools]

    model = config.get("model") or {}
    harness = AgentHarness(
        model_name=model["name"],
        model_provider=model.get("provider"),
        prompt_path=config["prompts"]["system"],
        tools=tools,
        allowed_tools=allowed_tools,
        limits=ExecutionLimits(**(config.get("limits") or {})),
        prefetchers=[plugin.prefetch for plugin in plugins if plugin.prefetch],
    )
    return IncidentAgent(harness, plugins)
