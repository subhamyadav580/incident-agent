"""
Elasticsearch plugin: index discovery, mapping, search tools and log prefetch.

Options (built from the stored connector by the server):
    enabled: true
    connection: {hosts, api_key | username+password, verify_certs, ca_certs}
    index_prefixes: {prefix: description | {description, fields, ...}}   # optional
    instructions: ""                  # optional extra guidance for the model
    request_timeout: 30
    prefetch:                         # LogPrefetcher options; enabled by default
      lookback: 24h
      fields: ["@timestamp", "message"]
      search_fields: [message]
      timestamp_field: "@timestamp"
      identifier_patterns: [...]

Without index_prefixes the plugin still works: the prefetch discovers which
index groups mention the message, and the model explores with list_es_indices.
"""
from ..base import Plugin
from .client import create_client
from .indices import IndexGroupConfig, parse_index_config
from .prefetch import LogPrefetcher
from .tools import build_tools


def build_instructions(index_config: dict[str, IndexGroupConfig], extra: str) -> str:
    lines = ["Application logs in Elasticsearch, grouped by index prefix (dates stripped)."]
    described = {prefix: config for prefix, config in sorted(index_config.items()) if config.description}
    if described:
        lines.append("")
        lines.append("Documented index groups (searched automatically for investigations):")
        for prefix, config in described.items():
            fields = f" Fields: {', '.join(config.fields)}." if config.fields else ""
            lines.append(f"- `{prefix}`: {config.description}{fields}")
    else:
        lines.append("")
        lines.append(
            "No index groups are documented. Call list_es_indices and choose groups by "
            "name (service names usually appear in the prefix)."
        )
    lines.append("")
    lines.append(
        "Before search_on_index, call get_index_mapping for the group's pattern. Always "
        "filter on a time range, set `size`, and request only the needed fields via `_source`."
    )
    if extra.strip():
        lines.append("")
        lines.append(extra.strip())
    return "\n".join(lines)


def create_plugin(options: dict) -> Plugin:
    es = create_client(
        request_timeout=options.get("request_timeout", 30),
        connection=options.get("connection"),
    )
    index_config = parse_index_config(options.get("index_prefixes"))

    prefetch_options = dict(options.get("prefetch") or {})
    prefetch = (
        LogPrefetcher(es, index_config, **prefetch_options)
        if prefetch_options.pop("enabled", True)
        else None
    )

    return Plugin(
        name="elasticsearch",
        tools=build_tools(es, index_config),
        instructions=build_instructions(index_config, options.get("instructions", "")),
        prefetch=prefetch,
        prefetch_intents=("investigation",),
        close=es.close,
    )
