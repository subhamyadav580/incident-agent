"""
Elasticsearch plugin: index discovery, mapping, search tools and log prefetch.

Config (the `plugins.elasticsearch` section of agent.yaml):
    enabled: true
    index_config: configs/es_indices.yaml   # prefix -> description, fields
    request_timeout: 30
    prefetch:
      enabled: true
      fields: ["@timestamp", "message"]   # defaults; per-prefix values override
      search_fields: [message]
      timestamp_field: "@timestamp"
      lookback: 24h
      size_per_index: 20
      max_field_chars: 2000
      identifier_patterns: [...]                  # optional regex list

Connection settings are read from the environment, see client.py.
"""
from ..base import Plugin
from .client import create_client
from .indices import load_index_config
from .prefetch import LogPrefetcher
from .tools import build_tools


def create_plugin(options: dict) -> Plugin:
    es = create_client(request_timeout=options.get("request_timeout", 30))
    index_config = load_index_config(options.get("index_config"))

    prefetch_options = dict(options.get("prefetch") or {})
    prefetch = (
        LogPrefetcher(es, index_config, **prefetch_options)
        if prefetch_options.pop("enabled", False)
        else None
    )

    return Plugin(
        name="elasticsearch",
        tools=build_tools(es, index_config),
        prefetch=prefetch,
        close=es.close,
    )
