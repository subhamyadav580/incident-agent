from dataclasses import dataclass
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
from .router import INTENT_INSTRUCTIONS, Intent
from .tracing import trace_event


@dataclass(frozen=True)
class PrefetchStep:
    """A function run before the first model call for the given intents."""

    name: str
    run: Callable[[str], str]
    intents: tuple[str, ...] = ("investigation",)


@dataclass(frozen=True)
class Connector:
    """How the model should use one data source; added to the system prompt."""

    name: str
    instructions: str


class AgentHarness:
    def __init__(
        self,
        *,
        model_name: str,
        model_provider: Optional[str] = None,
        model_api_key: Optional[str] = None,
        system_prompt: str,
        tools: list,
        allowed_tools: list[str],
        limits: ExecutionLimits,
        prefetchers: Sequence[PrefetchStep] = (),
        connectors: Sequence[Connector] = (),
        router: bool = True,
        router_model_name: Optional[str] = None,
        router_model_provider: Optional[str] = None,
    ):
        self.limits = limits
        # Run once before the first model call; their output is added as evidence.
        self.prefetchers = list(prefetchers)
        self.router_enabled = router
        self.policy = ToolPolicy(allowed_tools)

        # Only register explicitly allowed tools.
        tool_map = {tool.name: tool for tool in tools}

        for name in allowed_tools:
            if name not in tool_map:
                raise ValueError(f"Unknown configured tool: {name}")

        self.tools = [
            tool_map[name] for name in allowed_tools
        ]

        self.system_prompt = system_prompt

        described = [connector for connector in connectors if connector.instructions.strip()]
        if described:
            self.system_prompt += "\n\n# Connected data sources\n" + "".join(
                f"\n## {connector.name}\n\n{connector.instructions.strip()}\n"
                for connector in described
            )

        # Any provider supported by LangChain's init_chat_model (openai, anthropic,
        # ollama, ...); its integration package must be installed.
        # Without an explicit key the provider reads its own env var (OPENAI_API_KEY, ...).
        credentials = {"api_key": model_api_key} if model_api_key else {}
        self.chat_model = init_chat_model(
            model_name,
            model_provider=model_provider,
            temperature=0,
            **credentials,
        )
        self.model = self.chat_model.bind_tools(self.tools)

        if router:
            router_model = (
                init_chat_model(router_model_name, model_provider=router_model_provider, temperature=0, **credentials)
                if router_model_name
                else self.chat_model
            )
            self.router = router_model.with_structured_output(Intent)

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

    def _classify(self, state: AgentState):
        run_id = state["run_id"]
        task = state["messages"][0].content

        try:
            result = self.router.invoke([
                SystemMessage(content=INTENT_INSTRUCTIONS),
                HumanMessage(content=task),
            ])
            intent, reason = result.intent, result.reason
        except Exception as error:
            # Investigating a chat message costs a little; ignoring an incident costs more.
            intent, reason = "investigation", f"router failed: {error!r}"

        trace_event(run_id, "intent_classified", intent=intent, reason=reason)
        return {"intent": intent}

    def _after_classify(self, state: AgentState):
        if state["intent"] == "conversation":
            return "converse"
        return "prefetch" if self.prefetchers else "agent"

    def _converse(self, state: AgentState):
        # No tools: answer from the conversation and the system prompt.
        response = self.chat_model.invoke([
            SystemMessage(content=self.system_prompt + (
                "\n\n# This message\n\nThe user is chatting, not reporting an incident. "
                "Reply briefly and helpfully. If they ask what you can do, describe the "
                "connected data sources and suggest pasting an error message or an id."
            )),
            *state["messages"],
        ])
        trace_event(state["run_id"], "conversation_reply")
        return {"messages": [response], "steps": state["steps"] + 1}

    def _prefetch(self, state: AgentState):
        run_id = state["run_id"]
        task = state["messages"][0].content
        intent = state.get("intent", "investigation")

        messages = []

        for step in self.prefetchers:
            if intent not in step.intents:
                continue
            name = step.name
            trace_event(run_id, "prefetch_started", prefetch=name)

            try:
                evidence = step.run(task)
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
            builder.add_edge("prefetch", "agent")

        if self.router_enabled:
            builder.add_node("classify", self._classify)
            builder.add_node("converse", self._converse)
            builder.add_edge(START, "classify")
            builder.add_conditional_edges(
                "classify",
                self._after_classify,
                {"converse": "converse", "prefetch": "prefetch" if self.prefetchers else "agent", "agent": "agent"},
            )
            builder.add_edge("converse", END)
        elif self.prefetchers:
            builder.add_edge(START, "prefetch")
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

    def run(self, task: str, run_id: str) -> str:
        return self.run_with_details(task, run_id)["report"]

    def run_with_details(self, task: str, run_id: str) -> dict:
        """Run and return {report, intent, steps, run_id}."""
        trace_event(run_id, "run_started")

        result = self.graph.invoke(
            {
                "messages": [
                    ("human", task)
                ],
                "steps": 0,
                "run_id": run_id,
                # Without the router every message is investigated.
                "intent": "investigation",
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
            intent=result.get("intent"),
            steps=result["steps"],
        )

        return {
            "report": result["messages"][-1].content,
            "intent": result.get("intent"),
            "steps": result["steps"],
            "run_id": run_id,
        }