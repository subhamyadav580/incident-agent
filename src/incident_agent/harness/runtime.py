from pathlib import Path
from typing import Callable, Optional, Sequence

from langchain_core.messages import (
    SystemMessage,
    AIMessage,
    HumanMessage,
)
from langchain.chat_models import init_chat_model
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode

from .state import AgentState
from .limits import ExecutionLimits
from .policies import ToolPolicy
from .tracing import trace_event


class AgentHarness:
    def __init__(
        self,
        *,
        model_name: str,
        model_provider: Optional[str] = None,
        prompt_path: str,
        tools: list,
        allowed_tools: list[str],
        limits: ExecutionLimits,
        prefetchers: Sequence[Callable[[str], str]] = (),
    ):
        self.limits = limits
        # Run once before the first model call; their output is added as evidence.
        self.prefetchers = list(prefetchers)
        self.policy = ToolPolicy(allowed_tools)

        # Only register explicitly allowed tools.
        tool_map = {tool.name: tool for tool in tools}

        for name in allowed_tools:
            if name not in tool_map:
                raise ValueError(f"Unknown configured tool: {name}")

        self.tools = [
            tool_map[name] for name in allowed_tools
        ]

        self.system_prompt = Path(
            prompt_path
        ).read_text(encoding="utf-8")

        # Any provider supported by LangChain's init_chat_model (openai, anthropic,
        # ollama, ...); its integration package must be installed.
        self.model = init_chat_model(
            model_name,
            model_provider=model_provider,
            temperature=0,
        ).bind_tools(self.tools)

        self.graph = self._build_graph()

    def _call_model(self, state: AgentState):
        run_id = state["run_id"]
        next_step = state["steps"] + 1

        trace_event(
            run_id,
            "model_call_started",
            step=next_step,
        )

        response = self.model.invoke([
            SystemMessage(content=self.system_prompt),
            *state["messages"],
        ])

        trace_event(
            run_id,
            "model_call_completed",
            step=next_step,
            tool_calls=len(response.tool_calls),
        )

        return {
            "messages": [response],
            "steps": next_step,
        }

    def _prefetch(self, state: AgentState):
        run_id = state["run_id"]
        task = state["messages"][0].content

        messages = []

        for prefetch in self.prefetchers:
            name = getattr(prefetch, "__name__", type(prefetch).__name__)
            trace_event(run_id, "prefetch_started", prefetch=name)

            try:
                evidence = prefetch(task)
            except Exception as error:
                # The agent can still investigate with its tools, so don't fail the run.
                trace_event(run_id, "prefetch_failed", prefetch=name, error=repr(error))
                evidence = (
                    f"Automatic pre-fetch {name} failed: {error!r}. "
                    "Gather this evidence yourself with the available tools."
                )
            else:
                trace_event(run_id, "prefetch_completed", prefetch=name, chars=len(evidence))

            messages.append(HumanMessage(content=evidence))

        return {"messages": messages}

    def _route(self, state: AgentState):
        last = state["messages"][-1]

        if not getattr(last, "tool_calls", []):
            return "done"

        if state["steps"] >= self.limits.max_steps:
            return "limit_reached"

        return "tools"

    def _limit_reached(self, state: AgentState):
        trace_event(
            state["run_id"],
            "step_limit_reached",
            steps=state["steps"],
        )

        return {
            "messages": [
                AIMessage(content=(
                    "Investigation stopped because the step "
                    "budget was exhausted. The available evidence "
                    "may be incomplete. Run another investigation "
                    "with a higher approved budget if needed."
                ))
            ]
        }

    def _build_graph(self):
        builder = StateGraph(AgentState)

        builder.add_node("agent", self._call_model)
        builder.add_node("tools", ToolNode(self.tools))
        builder.add_node("limit_reached", self._limit_reached)

        if self.prefetchers:
            builder.add_node("prefetch", self._prefetch)
            builder.add_edge(START, "prefetch")
            builder.add_edge("prefetch", "agent")
        else:
            builder.add_edge(START, "agent")

        builder.add_conditional_edges(
            "agent",
            self._route,
            {
                "tools": "tools",
                "done": END,
                "limit_reached": "limit_reached",
            },
        )

        builder.add_edge("tools", "agent")
        builder.add_edge("limit_reached", END)

        return builder.compile()

    def run(self, task: str, run_id: str):
        trace_event(run_id, "run_started")

        result = self.graph.invoke(
            {
                "messages": [
                    ("human", task)
                ],
                "steps": 0,
                "run_id": run_id,
            },
            config={
                # Secondary safeguard against runaway graph loops.
                "recursion_limit": (
                    self.limits.max_steps * 3 + 5
                )
            },
        )

        trace_event(
            run_id,
            "run_completed",
            steps=result["steps"],
        )

        return result["messages"][-1].content