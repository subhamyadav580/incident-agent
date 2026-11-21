from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL

from incident_agent.plugins.postgres.schema import parse_database_schema, quote_identifier

from ...schemas.connector import FieldSpec
from .base import COMMON_FIELDS, apply_defaults, parse_yaml_mapping
from .errors import ConnectorInvalid

MAX_TABLES = 2000

# Tables, views and materialized views the user may read, without system schemas
# and without child tables (declarative partitions or inheritance children such
# as orders_2024_11): a parent's row estimate includes its children.
LIST_TABLES = text(f"""
    SELECT n.nspname, c.relname,
           (greatest(c.reltuples, 0) + coalesce(kids.rows, 0))::bigint,
           coalesce(obj_description(c.oid), ''),
           coalesce(kids.count, 0)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN LATERAL (
        SELECT count(*) AS count, sum(greatest(child.reltuples, 0)) AS rows
        FROM pg_inherits i JOIN pg_class child ON child.oid = i.inhrelid
        WHERE i.inhparent = c.oid
    ) kids ON true
    WHERE c.relkind IN ('r', 'p', 'v', 'm')
      AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = c.oid)
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg\\_toast%'
      AND has_table_privilege(c.oid, 'SELECT')
    ORDER BY 3 DESC, c.relname
    LIMIT {MAX_TABLES + 1}
""")

DESCRIBE_COLUMNS = text("""
    SELECT a.attname, format_type(a.atttypid, a.atttypmod), coalesce(col_description(a.attrelid, a.attnum), '')
    FROM pg_attribute a
    WHERE a.attrelid = to_regclass(:table) AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attnum
""")

# Columns that lead an index: safe to look rows up by.
INDEXED_COLUMNS = text("""
    SELECT DISTINCT a.attname
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
    WHERE i.indrelid = to_regclass(:table)
""")


def _rows_label(rows: int) -> str:
    if rows >= 1_000_000:
        return f"~{rows / 1_000_000:.1f}M rows"
    if rows >= 1_000:
        return f"~{rows / 1_000:.0f}K rows"
    return f"~{rows} rows"


def prune_tables(tables: dict) -> dict:
    """Keep only what the user actually described."""
    pruned = {}
    for name, table in (tables or {}).items():
        if not isinstance(table, dict):
            continue
        entry = {
            "description": (table.get("description") or "").strip(),
            "columns": {column: text.strip() for column, text in (table.get("columns") or {}).items() if (text or "").strip()},
            "lookup": [lookup for lookup in (table.get("lookup") or []) if lookup.get("column") and lookup.get("match")],
            "select": [column for column in (table.get("select") or []) if column],
        }
        entry = {key: value for key, value in entry.items() if value}
        if entry:
            pruned[name] = entry
    return pruned


def _tables(settings: dict) -> dict:
    # Connectors saved before the table editor stored YAML text.
    if settings.get("tables") is None and settings.get("tables_yaml"):
        return parse_yaml_mapping(settings["tables_yaml"], "Table descriptions")
    return settings.get("tables") or {}


class PostgresConnector:
    type = "postgres"
    label = "PostgreSQL"
    description = "Read-only SQL over a database. Each connector is one database the agent can query."
    plugin = "postgres"
    catalog_label = "Tables"
    fields = [
        FieldSpec(name="host", label="Host", kind="text", required=True, default="localhost"),
        FieldSpec(name="port", label="Port", kind="number", default=5432),
        FieldSpec(name="database", label="Database", kind="text", required=True),
        FieldSpec(name="username", label="Username", kind="text", required=True,
                  help="Use a read-only role."),
        FieldSpec(name="password", label="Password", kind="password", secret=True),
        FieldSpec(name="sslmode", label="SSL mode", kind="select", default="prefer",
                  options=["disable", "allow", "prefer", "require", "verify-ca", "verify-full"]),
        FieldSpec(name="description", label="What this database holds", kind="textarea",
                  help="Shown to the agent, e.g. 'Orders, payments and fulfilment state'."),
        *COMMON_FIELDS,
        FieldSpec(name="tables", label="Tables", kind="catalog",
                  help="Optional descriptions of tables and columns, and columns to look records up by."),
    ]

    def normalize(self, settings: dict, secrets: dict) -> dict:
        settings = dict(settings)
        if "tables_yaml" in settings:
            legacy = settings.pop("tables_yaml")
            settings.setdefault("tables", parse_yaml_mapping(legacy, "Table descriptions"))
        settings = apply_defaults(self.fields, settings)
        tables = prune_tables(settings.get("tables") or {})
        try:
            parse_database_schema("connector", {"tables": tables})
        except ValueError as error:
            raise ConnectorInvalid(f"Tables: {error}")
        if tables:
            settings["tables"] = tables
        else:
            settings.pop("tables", None)
        return settings

    def url(self, settings: dict, secrets: dict) -> URL:
        return URL.create(
            "postgresql+psycopg2",
            username=settings["username"],
            password=secrets.get("password") or None,
            host=settings["host"],
            port=settings.get("port"),
            database=settings["database"],
            query={"sslmode": settings["sslmode"]} if settings.get("sslmode") else {},
        )

    def _connect(self, settings: dict, secrets: dict):
        return create_engine(
            self.url(settings, secrets),
            connect_args={"connect_timeout": 5, "options": "-c statement_timeout=10000"},
        )

    def test(self, settings: dict, secrets: dict) -> str:
        engine = self._connect(settings, secrets)
        try:
            with engine.connect() as connection:
                version = connection.execute(text("SHOW server_version")).scalar()
                tables = connection.execute(text(
                    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"
                )).scalar()
            return f"Connected to PostgreSQL {version}; {tables} tables in schema public."
        finally:
            engine.dispose()

    def list_objects(self, settings: dict, secrets: dict) -> tuple[list[dict], bool]:
        engine = self._connect(settings, secrets)
        try:
            with engine.connect() as connection:
                rows = connection.execute(LIST_TABLES).fetchall()
        finally:
            engine.dispose()
        objects = [
            {
                "name": table if schema == "public" else f"{schema}.{table}",
                "detail": _rows_label(estimated_rows) + (f" · {children} partitions" if children else ""),
                "comment": comment,
            }
            for schema, table, estimated_rows, comment, children in rows[:MAX_TABLES]
        ]
        return objects, len(rows) > MAX_TABLES

    def describe_object(self, settings: dict, secrets: dict, name: str) -> list[dict]:
        qualified = quote_identifier(name if "." in name else f"public.{name}")
        engine = self._connect(settings, secrets)
        try:
            with engine.connect() as connection:
                columns = connection.execute(DESCRIBE_COLUMNS, {"table": qualified}).fetchall()
                indexed = {row[0] for row in connection.execute(INDEXED_COLUMNS, {"table": qualified})}
        finally:
            engine.dispose()
        if not columns:
            raise ConnectorInvalid(f"Table {name!r} not found or not readable")
        return [
            {"name": column, "type": data_type, "indexed": column in indexed, "comment": comment}
            for column, data_type, comment in columns
        ]

    def add_to_plugin(self, options: dict, name: str, settings: dict, secrets: dict) -> None:
        # One postgres plugin serves every database connector.
        options.setdefault("databases", []).append({
            "name": name,
            "url": self.url(settings, secrets).render_as_string(hide_password=False),
            "description": settings.get("description", ""),
            "tables": _tables(settings) or None,
        })
        if settings.get("instructions"):
            extra = options.get("instructions", "")
            options["instructions"] = f"{extra}\n\nDatabase `{name}`: {settings['instructions']}".strip()
