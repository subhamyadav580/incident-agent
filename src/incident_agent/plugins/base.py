from dataclasses import dataclass, field
from typing import Callable, Optional

from langchain_core.tools import BaseTool


Prefetch = Callable[[str], str]

# Message intents the harness routes on; see harness/router.py.
INTENTS = ("conversation", "investigation", "data_question")


@dataclass
class Plugin:
    """
    What a data-source plugin (connector) contributes to the agent.

    A plugin is any module exposing `create_plugin(options: dict) -> Plugin`,
    where `options` is that plugin's section of the agent config.

    tools:            LangChain tools the model may call during the investigation.
    instructions:     how and when to use this connector: what data it holds and
                      the rules for querying it. Added to the system prompt.
    prefetch:         optional function run once before the first model call. It
                      gets the user's message and returns text evidence for the model.
                      It may also set a JSON-serializable `last_evidence` attribute
                      that UIs can show next to the report, and a one-line
                      `last_summary` (e.g. "3 services matched") for run traces.
    prefetch_intents: the message intents the prefetch runs for.
    close:            optional cleanup (connection pools, clients) run after the run.
    """

    name: str
    tools: list[BaseTool] = field(default_factory=list)
    instructions: str = ""
    prefetch: Optional[Prefetch] = None
    prefetch_intents: tuple[str, ...] = ("investigation",)
    close: Optional[Callable[[], None]] = None

    def __post_init__(self):
        unknown = set(self.prefetch_intents) - set(INTENTS)
        if unknown:
            raise ValueError(f"Plugin {self.name!r}: unknown prefetch_intents {sorted(unknown)}; use {INTENTS}")
