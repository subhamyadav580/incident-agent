# incident-agent

An LLM agent that investigates production incidents. Paste an error message,
an id, or a question, e.g. *"NumberFormatException: For input string ..."* or
*"order 48213 failed at checkout"*. It finds that error across your services'
logs, follows affected requests through every service, queries your databases
if needed, and writes a report: summary, timeline, likely root cause, and what
it couldn't verify.

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
message ──► classify intent ──┬─ conversation ──► reply (no data access)
                              ├─ data_question ─► lookups ──► agent (LLM) ⇄ tools ──► answer
                              └─ investigation ─► logs + lookups ──► agent (LLM) ⇄ tools ──► report
```

0. **Intent.** One small model call decides whether the message is a chat
   message, a question about data ("status of order X?") or something to
   investigate (an error message, a failing id, "checkout is slow").

1. **Prefetch (deterministic).** Before the model runs, each connector can gather
   evidence. Elasticsearch, in two `msearch` calls over every index group you
   have described (or, if none is, the groups that mention the message):
   - **Error occurrences:** takes the error's signature from the message
     (exception names, fixed phrases and URL paths; ids, numbers and quoted
     values are dropped) and returns, per service, the true count, first/last
     seen, an hourly histogram and the distinct message patterns with counts.
   - **Request traces:** takes the ids in the message, or a few from the
     matching log lines, and returns each service's log patterns for that
     request in time order.

   Repeated lines are collapsed into patterns, so 100k matching lines still
   produce a few KB of evidence. PostgreSQL looks up the rows of ids in the
   message for tables with a configured lookup. No model calls are spent on it.
2. **Agent loop.** The model reads the evidence and calls tools only to fill
   gaps: a wider time range, a related id it found in the logs, or database
   state. Built on [LangGraph](https://github.com/langchain-ai/langgraph).
3. **Limits.** The loop stops after the configured number of model steps and says the
   evidence may be incomplete.

## Quickstart

Requires Python 3.11+, [uv](https://docs.astral.sh/uv/), Node 20+ (to build
the web UI) and a local PostgreSQL for the app's own data (connectors,
credentials, settings).

```bash
git clone <this repo> && cd incident-agent
uv sync
(cd frontend && npm install && npm run build)    # builds the UI into the server package

cp .env.example .env
uv run incident-agent-server --generate-key      # paste into .env as APP_SECRET_KEY
uv run incident-agent-server                      # http://127.0.0.1:8000
```

Then, in the browser:

1. **Connectors:** add your PostgreSQL databases and your Elasticsearch cluster,
   and press *Test connection*.
2. **Settings:** pick the model provider and model, and optionally add an API
   key and team instructions.
3. **Investigate:** paste an error message or a failing id.

| Page | What it shows |
|---|---|
| **Overview** | Investigations, failures and average time to answer over 24h, messages by intent, live connector health with latency, recent investigations |
| **Investigate** | Searchable history; per investigation the summary, root cause, affected services (match counts, hourly trend, first/last seen, distinct log patterns), code references, request traces, database records, a UTC-ordered timeline, evidence gaps, and a **Workflow** view of how the run went: each step (classify, data gathering per source, model steps, tool calls) as a timed bar with its tokens, arguments, result preview and errors |
| **Connectors** | Data sources with health, latency and an enable switch; add or edit them in a side panel |
| **Settings** | Model, routing, step limit, API key, team instructions |

The CLI uses the same database, so it sees the same connectors and settings:

```bash
uv run incident-agent "request 0a5c19d9a57b86b6 returned 500"
echo "checkout is failing for user 8812" | uv run incident-agent -
```

### Frontend development

The UI is React 19 + TypeScript, styled with Tailwind CSS v4 (design tokens
as CSS variables in `frontend/src/index.css`, light and dark themes, compact
and comfortable density). Data fetching uses TanStack Query; routing uses
React Router with pages loaded on demand.

```bash
uv run incident-agent-server          # API on :8000
cd frontend && npm run dev            # UI on :5173 with hot reload, proxies /api to :8000
npm run typecheck                     # strict TypeScript
npm run build                         # production build into src/incident_agent/server/static
```

## Where things are stored

There are no config files. Everything is entered in the UI and stored in the
app database (`APP_DATABASE_URL`, created on first start):

| What | Where in the UI | Stored as |
|---|---|---|
| Connections (hosts, users, database names) | Connectors | `connectors.settings` |
| Passwords, API keys | Connectors, Settings | encrypted with `APP_SECRET_KEY` |
| Table and index-group descriptions, id lookups | Connector → Tables / Index groups tab | `connectors.settings` |
| Search tuning (time window, fields, id patterns) | Elasticsearch connector, *Advanced* | `connectors.settings` |
| Model, routing, step limit, team instructions | Settings | `app_settings` |

`.env` only holds what's needed to reach that database: `APP_DATABASE_URL`,
`APP_SECRET_KEY`, and optionally a provider key such as `OPENAI_API_KEY`.
Back up `APP_SECRET_KEY`: without it stored credentials can't be decrypted.

### Model

Any provider supported by LangChain's
[`init_chat_model`](https://python.langchain.com/docs/how_to/chat_models_universal_init/)
(openai, anthropic, google_genai, ollama, bedrock, ...). Install its package
(`uv add langchain-anthropic`) and set the provider and model in Settings.

### Describing your data (optional)

Without descriptions the agent still works: it finds the log groups that
mention the error and explores tables with `list_tables` / `describe_table`.
Descriptions make it faster and more accurate. Open a connector and go to its
second tab; the list is loaded live from the source, so there is nothing to
type by hand except the notes you want to add:

- **PostgreSQL → Tables:** every readable table with its size (child tables
  and partitions are folded into their parent). Add a description inline;
  expand a table to see its columns, types and which are indexed, then
  optionally describe a column (e.g. status codes), mark it **Look up by**
  with an id pattern (the row is fetched automatically when a message
  contains a matching id), and tick **Show** to limit the columns returned.
- **Elasticsearch → Index groups:** indices grouped by name with the date
  stripped (`checkout-logs-2026.10.21` → `checkout-logs`). Add a description
  inline; expand a group to see its fields from the mapping and tick which to
  **Return**, which to **Search** for ids and error text, and the
  **Timestamp** field. Described groups are searched for every incident.

Only what you fill in is saved; everything else is left as it is.

**Id formats:** by default ids are mixed letter-and-digit tokens of 6+
characters and numbers of 8+ digits. Set your own regexes in the Elasticsearch
connector's *Advanced* tab, e.g. `\bORD-\d+\b`.

## Connectors

| Connector | Tools | Prefetch | Without descriptions |
|---|---|---|---|
| Elasticsearch | `list_es_indices`, `get_index_mapping`, `search_on_index` | error occurrences + request traces | finds the index groups that mention the message |
| PostgreSQL | `list_databases`, `list_tables`, `describe_table`, `fetch_one`, `fetch_all` | rows for ids matching table lookups | model explores with `list_tables` / `describe_table` |
| Git repository | `search_code`, `read_file`, `list_files`, `recent_commits` | where the error text and exception names appear in the code, with surrounding lines | — (works on any repo) |

Several PostgreSQL connectors can be enabled at once; the agent sees each as a
named database. One Elasticsearch connector can be enabled at a time. Every SQL
query runs with a statement timeout.

**Git repositories** are read-only. A *remote* repo (HTTPS URL, optional
read-only access token) is cloned into `APP_DATA_DIR/repos` with the last
`history_days` of commits and fetched again every `refresh_minutes`; the token
is sent per command and never written into the clone. A *local* repo is read
in place from a path on the server machine. Log messages usually appear
literally in source code, so for an error message the agent gets the exact
file and line that logs or throws it, and can check `recent_commits` for a
change that shipped just before the incident. Add one connector per repo;
several can be enabled at once.

### Adding a connector type

The UI draws its forms from the server, so a new type needs no UI work:

1. A plugin (`src/incident_agent/plugins/<name>/`) with
   `create_plugin(options) -> Plugin`, see below.
2. A connector type (`src/incident_agent/server/services/connectors/<name>.py`)
   declaring its form fields, a connection test, and how its settings become
   plugin options; register it in `registry.py`.

## Writing a plugin

A plugin is any module with a `create_plugin(options) -> Plugin` function.
`options` is the dict built from its connector's settings.

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

    return Plugin(
        name="loki",
        tools=[query_loki],
        instructions="Logs in Loki. Query with LogQL; labels: app, env, level.",
        prefetch=prefetch,
        prefetch_intents=("investigation",),   # also: "data_question"
        close=client.close,
    )
```

Pass it to `build_agent` as `{"loki": {"enabled": True, "module": "my_package.loki_plugin", "url": ...}}`,
or add a connector type for it (above) to configure it from the UI.

Tool docstrings are the model's instructions for the tool, so describe the
arguments and when to use it. Tool names must be unique across plugins.

## API

`GET /api/connector-types`, `GET|POST /api/connectors`,
`PATCH|DELETE /api/connectors/{id}`, `POST /api/connectors/test`,
`GET /api/connectors/{id}/health`, `GET|PUT /api/settings`,
`POST|GET /api/investigations`, `GET|DELETE /api/investigations/{id}`, `GET /api/overview`. OpenAPI docs at `/docs`.

The server has no login and binds to 127.0.0.1 by default. Put it behind your
own auth before exposing it to a network.

## Using it as a library

```python
from incident_agent import AgentConfig, build_agent

plugins = {
    "postgres": {"enabled": True, "databases": [
        {"name": "orders", "url": "postgresql://readonly:...@db/orders", "description": "Orders"},
    ]},
    "elasticsearch": {"enabled": True, "connection": {"hosts": "http://es:9200"}},
}
with build_agent(AgentConfig(model_name="gpt-4.1-mini"), plugins) as agent:
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
frontend/             # React + TypeScript + Tailwind UI
  src/api/            #   typed API client and TanStack Query hooks
  src/components/     #   app shell, UI primitives, status badges
  src/features/       #   overview, investigations, connectors, settings pages
  src/lib/            #   formatting, report/timeline parsing, theme & density
src/incident_agent/
  cli.py              # `incident-agent` command (reads the app database)
  app.py              # AgentConfig + build_agent(): settings + plugin options -> harness
  prompts/system.md   # built-in system prompt
  harness/            # LangGraph loop, limits, tracing
  server/             # web UI + API (FastAPI), layered:
    routes/           #   path -> handler registration
    api/handlers/     #   HTTP concerns, error -> status mapping
    services/         #   connectors (CRUD, test, type registry), investigation
    repos/ models/ db/ #  persistence (local PostgreSQL)
    schemas/ core/    #   Pydantic contracts, settings, credential encryption
    static/           #   built UI (generated by `npm run build`, not committed)
  plugins/
    base.py           # the Plugin contract
    elasticsearch/    # client, index grouping, tools, prefetch
    postgres/         # database registry, read-only SQL tools
```
