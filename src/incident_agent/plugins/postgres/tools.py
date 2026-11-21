import logging
import re
from typing import Any, Dict, List, Optional

from langchain_core.tools import BaseTool, tool
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from .client import DatabaseRegistry
from .schema import DatabaseSchema

logger = logging.getLogger(__name__)


FORBIDDEN_KEYWORDS = {
    "insert",
    "update",
    "delete",
    "drop",
    "alter",
    "truncate",
    "create",
    "grant",
    "revoke",
    "merge",
    "replace",
    "execute",
    "call",
    "vacuum",
    "analyze",
    "refresh",
}


def validate_query(query: str) -> None:
    """
    Validate SQL query before execution.

    Rules:
    - Only SELECT and WITH queries are allowed.
    - Multiple statements are forbidden.
    - DDL/DML operations are forbidden.

    This is a guardrail, not a security boundary: connect with a read-only
    database role as well.
    """

    cleaned = query.strip().lower()

    # Remove SQL comments
    cleaned = re.sub(r'--.*?$', '', cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r'/\*.*?\*/', '', cleaned, flags=re.DOTALL)

    # Allow only SELECT or WITH
    if not (
        cleaned.startswith("select")
        or cleaned.startswith("with")
    ):
        raise ValueError(
            "Only SELECT and WITH queries are allowed."
        )

    # Block multiple statements
    stripped = cleaned.rstrip(";").strip()

    if ";" in stripped:
        raise ValueError(
            "Multiple SQL statements are not allowed."
        )

    # Check forbidden keywords
    words = set(re.findall(r"\b[a-z_]+\b", cleaned))

    blocked = words.intersection(FORBIDDEN_KEYWORDS)

    if blocked:
        raise ValueError(
            f"Forbidden SQL operation detected: {', '.join(sorted(blocked))}"
        )


def open_session(registry: DatabaseRegistry, database: Optional[str], statement_timeout_ms: int):
    """A session whose statements are cancelled after statement_timeout_ms."""
    session = registry.get(database).get_session()
    # SET cannot take bind parameters; the value is an int from config.
    session.execute(text(f"SET LOCAL statement_timeout = {int(statement_timeout_ms)}"))
    return session


def build_tools(
    registry: DatabaseRegistry,
    schemas: Optional[Dict[str, DatabaseSchema]] = None,
    max_rows: int = 200,
    statement_timeout_ms: int = 10_000,
) -> list[BaseTool]:
    """Create the SQL tools bound to one database registry."""
    schemas = schemas or {}

    def schema_for(database: Optional[str]) -> DatabaseSchema:
        return schemas.get(registry.get(database).name, DatabaseSchema())

    @tool
    def list_databases() -> List[Dict[str, Any]]:
        """
        List the databases the agent can query.

        Use the returned `name` as the `database` argument of the other tools.
        The entry flagged `is_default` is used when `database` is omitted.
        """
        return [
            {
                "name": name,
                "description": schemas.get(name, DatabaseSchema()).description or database.description,
                "is_default": name == registry.default,
            }
            for name, database in sorted(registry.databases.items())
        ]

    @tool
    def list_tables(
        database: Optional[str] = None,
        name_filter: Optional[str] = None,
        table_schema: str = "public",
    ) -> Dict[str, Any]:
        """
        List tables, described (important) ones first.

        Params:
            database: which configured database to query (see list_databases).
                      Defaults to the configured default database.
            name_filter: optional substring to filter table names, e.g. "order".
            table_schema: the schema to list, "public" by default.

        Returns {"described": [{table, description}], "other_tables": [...],
        "other_tables_total": n}. Prefer described tables; call describe_table
        before querying a table.
        """
        described = schema_for(database).tables
        session = open_session(registry, database, statement_timeout_ms)

        try:
            logger.info("Fetching list of tables on %r", database or registry.default)

            result = session.execute(
                text("""
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = :schema
                      AND (CAST(:name_filter AS text) IS NULL OR table_name ILIKE '%' || :name_filter || '%')
                    ORDER BY table_name
                """),
                {"schema": table_schema, "name_filter": name_filter},
            )
            names = [row[0] for row in result.fetchall()]

            others = [name for name in names if name not in described]
            return {
                "described": [
                    {"table": name, "description": described[name].description}
                    for name in names if name in described
                ],
                "other_tables": others[:max_rows],
                "other_tables_total": len(others),
            }

        except SQLAlchemyError:
            logger.exception("Database error while listing tables")
            raise

        finally:
            session.close()

    @tool
    def describe_table(
        table: str,
        database: Optional[str] = None,
        table_schema: str = "public",
    ) -> Dict[str, Any]:
        """
        Describe a table: its columns (name, type, meaning when documented) and
        which columns are indexed. Tables can be very large; filter on indexed
        columns and always use LIMIT.

        Params:
            table: the table name.
            database: which configured database to query (see list_databases).
            table_schema: the schema, "public" by default.
        """
        config = schema_for(database).tables.get(table)
        session = open_session(registry, database, statement_timeout_ms)

        try:
            columns = session.execute(
                text("""
                    SELECT column_name, data_type, is_nullable
                    FROM information_schema.columns
                    WHERE table_schema = :schema AND table_name = :table
                    ORDER BY ordinal_position
                """),
                {"schema": table_schema, "table": table},
            ).fetchall()
            if not columns:
                raise ValueError(f"Table {table_schema}.{table} not found")

            indexes = session.execute(
                text("SELECT indexdef FROM pg_indexes WHERE schemaname = :schema AND tablename = :table"),
                {"schema": table_schema, "table": table},
            ).fetchall()
            estimated_rows = session.execute(
                text("SELECT reltuples::bigint FROM pg_class WHERE oid = to_regclass(:qualified)"),
                {"qualified": f"{table_schema}.{table}"},
            ).scalar()

            documented = config.columns if config else {}
            return {
                "table": table,
                "description": config.description if config else "",
                "estimated_rows": estimated_rows,
                "columns": [
                    {
                        "name": name,
                        "type": data_type,
                        "nullable": nullable == "YES",
                        **({"description": documented[name]} if documented.get(name) else {}),
                    }
                    for name, data_type, nullable in columns
                ],
                "indexes": [row[0] for row in indexes],
            }

        except SQLAlchemyError:
            logger.exception("Database error while describing table")
            raise

        finally:
            session.close()

    @tool
    def fetch_one(
        query: str,
        params: Optional[Dict[str, Any]] = None,
        database: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Execute a read-only SQL query and return the first row.

        Notes:
        - Only SELECT and WITH queries are allowed.
        - INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE are forbidden.
        - Parameterized queries are recommended.

        Example:
            SELECT * FROM users WHERE id = :user_id

        Params:
            {"user_id": 1}

        Args:
            database: which configured database to query (see list_databases).
                      Defaults to the configured default database.
        """

        validate_query(query)

        session = open_session(registry, database, statement_timeout_ms)

        try:
            logger.info("Executing fetch_one query on %r", database or registry.default)

            result = session.execute(
                text(query),
                params or {},
            )

            row = result.mappings().first()

            return dict(row) if row else None

        except SQLAlchemyError:
            logger.exception("Database fetch_one error")
            raise

        finally:
            session.close()

    @tool
    def fetch_all(
        query: str,
        params: Optional[Dict[str, Any]] = None,
        database: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute a read-only SQL query and return its rows.

        Notes:
        - Only SELECT and WITH queries are allowed.
        - INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE are forbidden.
        - Parameterized queries are recommended.
        - At most a configured number of rows is returned; `truncated` is true when
          more rows matched. Add a WHERE clause or LIMIT to narrow the result.

        Example:
            SELECT * FROM users WHERE status = :status

        Params:
            {"status": "ACTIVE"}

        Args:
            database: which configured database to query (see list_databases).
                      Defaults to the configured default database.

        Returns {"rows": [...], "truncated": bool}.
        """

        validate_query(query)

        session = open_session(registry, database, statement_timeout_ms)

        try:
            logger.info("Executing fetch_all query on %r", database or registry.default)

            result = session.execute(
                text(query),
                params or {},
            )

            rows = result.mappings().fetchmany(max_rows + 1)

            return {
                "rows": [dict(row) for row in rows[:max_rows]],
                "truncated": len(rows) > max_rows,
            }

        except SQLAlchemyError:
            logger.exception("Database fetch_all error")
            raise

        finally:
            session.close()

    return [list_databases, list_tables, describe_table, fetch_one, fetch_all]
