import json
from dataclasses import dataclass
from typing import Callable, Optional, Sequence

from langchain_core.messages import (
    SystemMessage,
    AIMessage,
    HumanMessage,
    ToolMessage,
)
from langchain.chat_models import init_chat_model
from langgraph.graph import StateGraph, START, END

from .state import AgentState
from .limits import ExecutionLimits
from .policies import ToolPolicy
from .router import INTENT_INSTRUCTIONS, Intent
from .tracing import RunTrace, preview, trace_event


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
        self.tool_map = {tool.name: tool for tool in self.tools}
        # Spans of runs in progress, by run id (graph nodes only get the state).
        self._traces: dict[str, RunTrace] = {}

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
            self.router = router_model.with_structured_output(Intent, include_raw=True)

        self.graph = self._build_graph()

    def _trace(self, state: AgentState) -> RunTrace:
        return self._traces.setdefault(state["run_id"], RunTrace(state["run_id"]))

    @staticmethod
    def _tokens(message) -> dict:
        usage = getattr(message, "usage_metadata", None) or {}
        return {key: usage[key] for key in ("input_tokens", "output_tokens") if key in usage}

    def _call_model(self, state: AgentState):
        next_step = state["steps"] + 1

        with self._trace(state).span("model", f"Model step {next_step}") as span:
            response = self.model.invoke([
                SystemMessage(content=self.system_prompt),
                *state["messages"],
            ])
            span["detail"].update(
                self._tokens(response),
                outcome="tool calls" if response.tool_calls else "answer",
                tool_calls=[{"name": call["name"], "args": call["args"]} for call in response.tool_calls],
            )

        return {
            "messages": [response],
            "steps": next_step,
        }

    def _classify(self, state: AgentState):
        task = state["messages"][0].content

        with self._trace(state).span("intent", "Classify message") as span:
            try:
                result = self.router.invoke([
                    SystemMessage(content=INTENT_INSTRUCTIONS),
                    HumanMessage(content=task),
                ])
                parsed = result["parsed"]
                if parsed is None:
                    raise ValueError(result.get("parsing_error") or "no intent returned")
                intent, reason = parsed.intent, parsed.reason
                span["detail"].update(self._tokens(result["raw"]))
            except Exception as error:
                # Investigating a chat message costs a little; ignoring an incident costs more.
                intent, reason = "investigation", f"router failed: {error!r}"
                span["status"] = "error"
            span["detail"].update(intent=intent, reason=reason)

        return {"intent": intent}

    def _after_classify(self, state: AgentState):
        if state["intent"] == "conversation":
            return "converse"
        return "prefetch" if self.prefetchers else "agent"

    def _converse(self, state: AgentState):
        # No tools: answer from the conversation and the system prompt.
        with self._trace(state).span("model", "Reply") as span:
            response = self.chat_model.invoke([
                SystemMessage(content=self.system_prompt + (
                    "\n\n# This message\n\nThe user is chatting, not reporting an incident. "
                    "Reply briefly and helpfully. If they ask what you can do, describe the "
                    "connected data sources and suggest pasting an error message or an id."
                )),
                *state["messages"],
            ])
            span["detail"].update(self._tokens(response), outcome="answer")
        return {"messages": [response], "steps": state["steps"] + 1}

    def _prefetch(self, state: AgentState):
        task = state["messages"][0].content
        intent = state.get("intent", "investigation")
        trace = self._trace(state)

        messages = []

        for step in self.prefetchers:
            if intent not in step.intents:
                continue

            with trace.span("prefetch", step.name) as span:
                try:
                    evidence = step.run(task)
                except Exception as error:
                    # The agent can still investigate with its tools, so don't fail the run.
                    span["status"] = "error"
                    span["detail"]["error"] = preview(str(error) or repr(error), 300)
                    evidence = (
                        f"Automatic pre-fetch {step.name} failed: {error!r}. "
                        "Gather this evidence yourself with the available tools."
                    )
                else:
                    span["detail"]["chars"] = len(evidence)
                    summary = getattr(step.run, "last_summary", None)
                    if summary:
                        span["detail"]["summary"] = summary

            messages.append(HumanMessage(content=evidence))

        return {"messages": messages}

    def _run_tools(self, state: AgentState):
        """Execute the tool calls of the last model message, one span per call."""
        trace = self._trace(state)
        messages = []
        for call in state["messages"][-1].tool_calls:
            with trace.span("tool", call["name"], args=call["args"]) as span:
                try:
                    self.policy.validate_tool(call["name"])
                    output = self.tool_map[call["name"]].invoke(call["args"])
                    content = output if isinstance(output, str) else json.dumps(output, ensure_ascii=False, default=str)
                    span["detail"].update(result_chars=len(content), result=preview(content))
                except Exception as error:
                    # Return the error to the model so it can correct the call.
                    content = f"Error: {error}"
                    span["status"] = "error"
                    span["detail"]["error"] = preview(str(error), 300)
            messages.append(ToolMessage(content=content, tool_call_id=call["id"], name=call["name"]))
        return {"messages": messages}

    def _route(self, state: AgentState):
        last = state["messages"][-1]

        if not getattr(last, "tool_calls", []):
            return "done"

        if state["steps"] >= self.limits.max_steps:
            return "limit_reached"

        return "tools"

    def _limit_reached(self, state: AgentState):
        with self._trace(state).span("limit", "Step budget reached", steps=state["steps"]) as span:
            span["status"] = "error"

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
        builder.add_node("tools", self._run_tools)
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
        """Run and return {report, intent, steps, run_id, trace}."""
        trace_event(run_id, "run_started")
        trace = self._traces[run_id] = RunTrace(run_id)

        try:
            result = self._invoke(task, run_id)
        finally:
            self._traces.pop(run_id, None)

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
            "trace": trace.spans,
        }

    def _invoke(self, task: str, run_id: str) -> dict:
        return self.graph.invoke(
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
