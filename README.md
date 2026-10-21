# incident-agent

An LLM agent that investigates production incidents. Give it a message like
*"order 48213 failed at checkout"*. It searches your logs for the ids in that
message, follows up with its own queries against your logs and databases, and
writes a report: summary, timeline, likely root cause, and what it couldn't verify.

```
$ incident-agent "Payment for order ORD-48213 failed at 10:42"

Investigation report:

- Summary: The payment gateway timed out after 30s for ORD-48213 ...
- Timeline: ...
- Root cause: (fact) ... (hypothesis) ...
- Evidence gaps: ...
```

## How it works

```
message ──► prefetch ──► agent (LLM) ⇄ tools ──► report
            (code)
```

1. **Prefetch (deterministic).** Before the model runs, each plugin can gather
   evidence. The Elasticsearch plugin pulls identifiers out of the message
   (order ids, request ids, UUIDs, ...) and searches every index group you
   have described, in a single `msearch`. No model calls are spent on it.
2. **Agent loop.** The model reads the evidence and calls tools only to fill
   gaps: a wider time range, a related id it found in the logs, or database
   state. Built on [LangGraph](https://github.com/langchain-ai/langgraph).
3. **Limits.** The loop stops after `limits.max_steps` model turns and says the
   evidence may be incomplete.

## Quickstart

Requires Python 3.11+ and [uv](https://docs.astral.sh/uv/).

```bash
git clone <this repo> && cd incident-agent
uv sync

cp .env.example .env                                   # API key, ES hosts, database URLs
cp configs/es_indices.example.yaml configs/es_indices.yaml   # describe your log indices

uv run incident-agent "request 0a5c19d9a57b86b6 returned 500"
```

Other ways to pass the message:

```bash
echo "checkout is failing for user 8812" | uv run incident-agent -
uv run incident-agent -c path/to/agent.yaml -q "..."    # custom config, report only
```

## Configuration

Shared defaults are committed. Your own settings go in gitignored files next
to them. The rule is simple: **anything named `*.local.*` or `.env` is yours
and never pushed.**

| Shared default (committed) | Your copy (gitignored) | Purpose |
|---|---|---|
| `configs/agent.yaml` | `configs/agent.local.yaml` | Model, prompt, enabled plugins and their options, limits |
| `configs/es_indices.example.yaml` | `configs/es_indices.yaml` | What each of your log index groups contains |
| `.env.example` | `.env` | API keys, hosts, database URLs |
| `prompts/system.md` | `prompts/system.local.md` | The agent's instructions and report format |

`configs/agent.local.yaml` is merged on top of `agent.yaml` automatically:
nested keys merge, while lists and plain values replace. Write only what differs:

```yaml
# configs/agent.local.yaml  (template: configs/agent.local.example.yaml)
model:
  provider: anthropic
  name: claude-sonnet-5-5
prompts:
  system: prompts/system.local.md   # your team's service map, terms, runbooks
plugins:
  postgres:
    enabled: false
```

### Model

Any provider supported by LangChain's
[`init_chat_model`](https://python.langchain.com/docs/how_to/chat_models_universal_init/):

```yaml
model:
  provider: anthropic        # openai, anthropic, google_genai, ollama, bedrock, ...
  name: claude-sonnet-5-5
```

Install the provider's integration package (`uv add langchain-anthropic`) and
set its API key in `.env`. OpenAI works out of the box.

### Describing your log indices

Time-based indices are grouped by stripping the date suffix
(`checkout-logs-2026.10.21` → `checkout-logs`, data streams by stream name).
Describe the groups the agent should search for every incident, and which
fields to fetch from them:

```yaml
# configs/es_indices.yaml
index_prefixes:
  checkout-service-logs:
    description: Application logs of the checkout service — cart, payment and order creation.
    fields: ["@timestamp", "message", "log.level", "trace.id"]   # returned to the model
    search_fields: [message]          # optional: where ids are matched
    timestamp_field: "@timestamp"     # optional: time range and sort
  logs-apm.error-default: APM errors across all services.   # short form, default fields
  nginx-access-logs: ""               # available to the tools, skipped by prefetch
```

Descriptions and fields are shown to the model. Only described groups are
prefetched. Omitted keys fall back to the `prefetch` defaults in `agent.yaml`
(`fields: ["@timestamp", "message"]`, `search_fields: [message]`). Keeping
`fields` small keeps the evidence within the model's context.

### Matching your id formats

The default patterns match mixed letter-and-digit tokens of 6+ characters and
numbers of 8+ digits. Set your own in `agent.yaml`:

```yaml
plugins:
  elasticsearch:
    prefetch:
      identifier_patterns:
        - '\bORD-\d+\b'
        - '\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b'
```

## Built-in plugins

| Plugin | Tools | Prefetch | Environment |
|---|---|---|---|
| `elasticsearch` | `list_es_indices`, `get_index_mapping`, `search_on_index` | yes | `ES_HOSTS`, `ES_API_KEY` or `ES_USERNAME`/`ES_PASSWORD`, `ES_VERIFY_CERTS`, `ES_CA_CERTS` |
| `postgres` | `list_databases`, `list_tables`, `fetch_one`, `fetch_all` | no | `<NAME>_DATABASE_URL`, `<NAME>_DATABASE_DESC`, `DEFAULT_DATABASE` |

Disable a plugin you don't use with `enabled: false`. Its dependencies aren't
touched and its environment variables aren't required.

## Writing a plugin

A plugin is any module with a `create_plugin(options) -> Plugin` function.
`options` is its section of `agent.yaml`.

```python
# my_package/loki_plugin.py
from langchain_core.tools import tool
from incident_agent import Plugin


def create_plugin(options: dict) -> Plugin:
    client = LokiClient(options["url"])

    @tool
    def query_loki(logql: str, since: str = "1h") -> list[dict]:
        """Run a LogQL query against Loki and return matching log lines."""
        return client.query(logql, since=since)

    def prefetch(message: str) -> str:
        """Optional: evidence gathered before the model runs."""
        return "Pre-fetched Loki evidence:\n" + client.search_ids_in(message)

    return Plugin(name="loki", tools=[query_loki], prefetch=prefetch, close=client.close)
```

```yaml
# configs/agent.yaml
plugins:
  loki:
    enabled: true
    module: my_package.loki_plugin
    url: http://loki:3100
```

Tool docstrings are the model's instructions for the tool, so describe the
arguments and when to use it. Tool names must be unique across plugins.

## Using it as a library

```python
from incident_agent import build_agent, load_config

with build_agent(load_config("configs/agent.yaml")) as agent:
    print(agent.investigate("order 48213 failed at checkout"))
```

## Safety

- The SQL tools accept only a single `SELECT`/`WITH` statement and reject
  write keywords. That is a guardrail, not a security boundary: **connect with
  a read-only database role.** The same goes for Elasticsearch credentials.
- Retrieved logs and rows are sent to your model provider. Check that this is
  acceptable for your data before pointing the agent at production.
- The system prompt tells the model to treat retrieved data as untrusted input
  and to separate facts from hypotheses.

## Project layout

```
src/incident_agent/
  cli.py              # `incident-agent` command
  app.py              # build_agent(): config -> plugins -> harness
  harness/            # LangGraph loop, limits, tracing
  plugins/
    base.py           # the Plugin contract
    elasticsearch/    # client, index grouping, tools, prefetch
    postgres/         # database registry, read-only SQL tools
configs/              # agent.yaml, es_indices.example.yaml
prompts/system.md
```
