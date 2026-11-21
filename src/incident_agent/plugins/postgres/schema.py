"""
Optional description of a database (stored per connector): what the important tables hold, what
their columns mean, and how to look rows up by an id found in the user's message.

    databases:
      orders:
        description: Orders and payments          # overrides <NAME>_DATABASE_DESC
        tables:
          orders:
            description: One row per order.
            columns:
              order_id: Public order id, e.g. ORD-48213
              status: P = pending, C = confirmed, F = failed
            lookup:                               # used by the prefetch step
              - column: order_id                  # must be indexed
                match: '\\bORD-\\d+\\b'           # regex for ids in the message
            select: [order_id, status, created_at]   # columns returned by lookups
"""
import logging
import re
from dataclasses import dataclass, field
from typing import Optional


logger = logging.getLogger(__name__)

_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_$]*$")


def quote_identifier(name: str) -> str:
    """Quote a (schema-qualified) table or column name from config for SQL."""
    parts = name.split(".")
    for part in parts:
        if not _IDENTIFIER.match(part):
            raise ValueError(f"Invalid SQL identifier in schema config: {name!r}")
    return ".".join(f'"{part}"' for part in parts)


@dataclass(frozen=True)
class Lookup:
    column: str
    match: re.Pattern


@dataclass(frozen=True)
class TableConfig:
    name: str
    description: str = ""
    columns: dict[str, str] = field(default_factory=dict)
    lookups: tuple[Lookup, ...] = ()
    select: Optional[tuple[str, ...]] = None


@dataclass(frozen=True)
class DatabaseSchema:
    description: str = ""
    tables: dict[str, TableConfig] = field(default_factory=dict)


def _parse_table(database: str, name: str, value) -> TableConfig:
    where = f"databases.{database}.tables.{name}"
    if value is None or isinstance(value, str):
        return TableConfig(name=name, description=(value or "").strip())
    if not isinstance(value, dict):
        raise ValueError(f"{where} must be a description string or a mapping")

    unknown = set(value) - {"description", "columns", "lookup", "select"}
    if unknown:
        raise ValueError(f"{where} has unknown keys: {', '.join(sorted(unknown))}")

    quote_identifier(name)
    lookups = []
    for entry in value.get("lookup") or []:
        if not isinstance(entry, dict) or "column" not in entry or "match" not in entry:
            raise ValueError(f"{where}.lookup entries need `column` and `match`")
        quote_identifier(entry["column"])
        lookups.append(Lookup(column=entry["column"], match=re.compile(entry["match"])))

    select = value.get("select")
    if select is not None:
        for column in select:
            quote_identifier(column)

    return TableConfig(
        name=name,
        description=(value.get("description") or "").strip(),
        columns={column: (text or "").strip() for column, text in (value.get("columns") or {}).items()},
        lookups=tuple(lookups),
        select=tuple(select) if select else None,
    )


def parse_database_schema(database: str, value: Optional[dict]) -> DatabaseSchema:
    value = value or {}
    return DatabaseSchema(
        description=(value.get("description") or "").strip(),
        tables={
            name: _parse_table(database, name, table)
            for name, table in (value.get("tables") or {}).items()
        },
    )


def parse_schema_config(databases: Optional[dict]) -> dict[str, DatabaseSchema]:
    """Parse a `databases` mapping (from a file or from stored connector settings)."""
    return {
        database.lower(): parse_database_schema(database, value)
        for database, value in (databases or {}).items()
    }
