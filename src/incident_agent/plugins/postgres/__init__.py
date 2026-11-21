"""
Postgres plugin: read-only SQL tools over one or more named databases, and an
optional row lookup for ids in the user's message.

Options (built from the stored connectors by the server):
    enabled: true
    databases: [{name, url, description, tables}]   # tables: see schema.py
    default_database: <name>                        # optional
    instructions: ""                 # optional extra guidance for the model
    max_rows: 200                    # cap on rows returned by fetch_all
    statement_timeout_ms: 10000      # per query, tools and lookups
    prefetch: {rows_per_lookup: 5, max_value_chars: 500}   # enabled by default

Without table descriptions the model discovers tables itself with
list_tables / describe_table.
"""
from ..base import Plugin
from .client import DatabaseRegistry
from .prefetch import RowLookup
from .schema import DatabaseSchema, parse_database_schema
from .tools import build_tools


def build_instructions(registry: DatabaseRegistry, schemas: dict[str, DatabaseSchema], extra: str) -> str:
    lines = ["Read-only SQL (PostgreSQL) over these databases:"]
    for name, database in sorted(registry.databases.items()):
        description = schemas.get(name, DatabaseSchema()).description or database.description
        default = " (default)" if name == registry.default else ""
        lines.append(f"- `{name}`{default}: {description or 'no description'}")

    described = [
        (database, table)
        for database, schema in sorted(schemas.items())
        for table in schema.tables.values()
    ]
    if described:
        lines.append("")
        lines.append("Documented tables (start here):")
        for database, table in described:
            lookup = ", ".join(lookup.column for lookup in table.lookups)
            suffix = f" Look up by: {lookup}." if lookup else ""
            lines.append(f"- `{database}.{table.name}`: {table.description or 'no description'}{suffix}")
    else:
        lines.append("")
        lines.append(
            "No tables are documented. Discover them yourself: list_tables with a "
            "name_filter matching the entity in question (e.g. \"order\", \"user\", "
            "\"payment\"), then describe_table to see columns and indexes."
        )

    lines.append("")
    lines.append(
        "Tables can be very large. Call describe_table before querying an unfamiliar "
        "table, filter on indexed columns, and always add LIMIT. Queries time out."
    )
    if extra.strip():
        lines.append("")
        lines.append(extra.strip())
    return "\n".join(lines)


def create_plugin(options: dict) -> Plugin:
    databases = options.get("databases") or []
    registry = DatabaseRegistry(
        {db["name"].lower(): {"url": db["url"], "description": db.get("description", "")} for db in databases},
        options.get("default_database"),
    )
    schemas = {
        db["name"].lower(): parse_database_schema(db["name"], {"tables": db.get("tables")})
        for db in databases if db.get("tables")
    }
    statement_timeout_ms = options.get("statement_timeout_ms", 10_000)

    prefetch_options = dict(options.get("prefetch") or {"enabled": True})
    lookup = RowLookup(
        registry,
        schemas,
        statement_timeout_ms=min(statement_timeout_ms, 5_000),
        **{key: value for key, value in prefetch_options.items() if key != "enabled"},
    )
    prefetch = lookup if prefetch_options.get("enabled", True) and lookup.has_lookups() else None

    return Plugin(
        name="postgres",
        tools=build_tools(
            registry,
            schemas,
            max_rows=options.get("max_rows", 200),
            statement_timeout_ms=statement_timeout_ms,
        ),
        instructions=build_instructions(registry, schemas, options.get("instructions", "")),
        prefetch=prefetch,
        prefetch_intents=("investigation", "data_question"),
        close=registry.close_all,
    )
