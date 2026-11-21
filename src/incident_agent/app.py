import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .harness.limits import ExecutionLimits
from .harness.runtime import AgentHarness, Connector, PrefetchStep
from .plugins import Plugin, load_plugins

DEFAULT_PROMPT_PATH = Path(__file__).parent / "prompts" / "system.md"


def default_system_prompt() -> str:
    return DEFAULT_PROMPT_PATH.read_text(encoding="utf-8")


@dataclass
class AgentConfig:
    """Everything about the agent except its data sources."""

    model_name: str = "gpt-4.1-mini"
    # Any provider supported by LangChain's init_chat_model (openai, anthropic,
    # google_genai, ollama, ...); its integration package must be installed.
    model_provider: Optional[str] = "openai"
    # Falls back to the provider's environment variable (OPENAI_API_KEY, ...).
    model_api_key: Optional[str] = None
    router_enabled: bool = True
    router_model_name: Optional[str] = None
    max_steps: int = 8
    # Appended to the built-in prompt: your team's terms, service map, runbooks.
    extra_instructions: str = ""


class IncidentAgent:
    """An AgentHarness plus the plugins it was built from."""

    def __init__(self, harness: AgentHarness, plugins: list[Plugin]):
        self.harness = harness
        self.plugins = plugins

    def investigate(self, message: str, run_id: Optional[str] = None) -> str:
        return self.harness.run(task=message, run_id=run_id or str(uuid.uuid4()))

    def investigate_with_details(self, message: str, run_id: Optional[str] = None) -> dict:
        """
        Like investigate(), also returning the intent, number of model steps and
        each plugin's structured prefetch evidence ({plugin name: evidence}).
        """
        for plugin in self.plugins:
            if plugin.prefetch is not None and hasattr(plugin.prefetch, "last_evidence"):
                plugin.prefetch.last_evidence = None
        result = self.harness.run_with_details(task=message, run_id=run_id or str(uuid.uuid4()))
        result["evidence"] = {
            plugin.name: plugin.prefetch.last_evidence
            for plugin in self.plugins
            if getattr(plugin.prefetch, "last_evidence", None) is not None
        }
        return result

    def close(self) -> None:
        for plugin in self.plugins:
            if plugin.close:
                plugin.close()

    def __enter__(self) -> "IncidentAgent":
        return self

    def __exit__(self, *exc) -> None:
        self.close()


def build_agent(config: AgentConfig, plugins_config: Optional[dict] = None) -> IncidentAgent:
    """
    Build an agent from its config and the options of each data-source plugin,
    e.g. {"postgres": {"enabled": True, "databases": [...]}}.
    """
    plugins = load_plugins(plugins_config or {})

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

    system_prompt = default_system_prompt()
    if config.extra_instructions.strip():
        system_prompt += "\n\n# Team instructions\n\n" + config.extra_instructions.strip()

    harness = AgentHarness(
        model_name=config.model_name,
        model_provider=config.model_provider,
        model_api_key=config.model_api_key,
        system_prompt=system_prompt,
        tools=tools,
        allowed_tools=[t.name for t in tools],
        limits=ExecutionLimits(max_steps=config.max_steps),
        prefetchers=[
            PrefetchStep(name=plugin.name, run=plugin.prefetch, intents=plugin.prefetch_intents)
            for plugin in plugins if plugin.prefetch
        ],
        connectors=[Connector(name=plugin.name, instructions=plugin.instructions) for plugin in plugins],
        router=config.router_enabled,
        router_model_name=config.router_model_name,
        router_model_provider=config.model_provider,
    )
    return IncidentAgent(harness, plugins)
