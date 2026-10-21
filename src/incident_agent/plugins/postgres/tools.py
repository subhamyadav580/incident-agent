import logging
import re
from typing import Any, Dict, List, Optional

from langchain_core.tools import BaseTool, tool
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from .client import DatabaseRegistry

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


def build_tools(registry: DatabaseRegistry, max_rows: int = 200) -> list[BaseTool]:
    """Create the SQL tools bound to one database registry."""

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
                "description": database.description,
                "is_default": name == registry.default,
            }
            for name, database in sorted(registry.databases.items())
        ]

    @tool
    def list_tables(database: Optional[str] = None, table_schema: str = "public") -> List[str]:
        """
        List all tables in a schema.

        Params:
            database: which configured database to query (see list_databases).
                      Defaults to the configured default database.
            table_schema: the schema to list, "public" by default.
        """
        session = registry.get(database).get_session()

        try:
            logger.info("Fetching list of tables on %r", database or registry.default)

            result = session.execute(
                text("""
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = :schema
                    ORDER BY table_name
                """),
                {"schema": table_schema},
            )

            return [row[0] for row in result.fetchall()]

        except SQLAlchemyError:
            logger.exception("Database error while listing tables")
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

        session = registry.get(database).get_session()

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

        session = registry.get(database).get_session()

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

    return [list_databases, list_tables, fetch_one, fetch_all]
