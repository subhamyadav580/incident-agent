"""
Postgres plugin: read-only SQL tools over one or more named databases.

Config (the `plugins.postgres` section of agent.yaml):
    enabled: true
    max_rows: 200        # cap on rows returned by fetch_all

Databases are discovered from the environment, see client.py.
"""
from ..base import Plugin
from .client import DatabaseRegistry
from .tools import build_tools


def create_plugin(options: dict) -> Plugin:
    registry = DatabaseRegistry.from_env()

    return Plugin(
        name="postgres",
        tools=build_tools(registry, max_rows=options.get("max_rows", 200)),
        close=registry.close_all,
    )
