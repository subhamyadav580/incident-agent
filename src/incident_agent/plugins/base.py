from dataclasses import dataclass, field
from typing import Callable, Optional

from langchain_core.tools import BaseTool


Prefetch = Callable[[str], str]


@dataclass
class Plugin:
    """
    What a data-source plugin contributes to the agent.

    A plugin is any module exposing `create_plugin(options: dict) -> Plugin`,
    where `options` is that plugin's section of the agent config.

    tools:    LangChain tools the model may call during the investigation.
    prefetch: optional function run once before the first model call. It gets
              the user's message and returns text evidence for the model.
    close:    optional cleanup (connection pools, clients) run after the run.
    """

    name: str
    tools: list[BaseTool] = field(default_factory=list)
    prefetch: Optional[Prefetch] = None
    close: Optional[Callable[[], None]] = None
