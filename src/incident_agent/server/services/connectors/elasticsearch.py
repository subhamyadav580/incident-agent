import re

from incident_agent.plugins.elasticsearch.client import create_client
from incident_agent.plugins.elasticsearch.indices import flatten_mapping, index_groups, parse_index_config

from ...schemas.connector import FieldSpec
from .base import COMMON_FIELDS, apply_defaults, parse_yaml_mapping
from .errors import ConnectorConflict, ConnectorInvalid

MAX_FIELDS = 500


def _csv(value: str) -> list[str]:
    return [part.strip() for part in str(value).split(",") if part.strip()]


def _lines(value: str) -> list[str]:
    return [line.strip() for line in str(value or "").splitlines() if line.strip()]


def prune_index_groups(groups: dict) -> dict:
    """Keep only what the user actually described or selected."""
    pruned = {}
    for prefix, group in (groups or {}).items():
        if not isinstance(group, dict):
            continue
        entry = {
            "description": (group.get("description") or "").strip(),
            "fields": [field for field in (group.get("fields") or []) if field],
            "search_fields": [field for field in (group.get("search_fields") or []) if field],
            "timestamp_field": (group.get("timestamp_field") or "").strip(),
        }
        entry = {key: value for key, value in entry.items() if value}
        if entry:
            pruned[prefix] = entry
    return pruned


def _index_groups(settings: dict) -> dict:
    # Connectors saved before the index group editor stored YAML text.
    if settings.get("index_groups") is None and settings.get("indices_yaml"):
        return parse_yaml_mapping(settings["indices_yaml"], "Index group descriptions")
    return settings.get("index_groups") or {}


class ElasticsearchConnector:
    type = "elasticsearch"
    label = "Elasticsearch"
    description = "Application logs. The agent searches the error across services and traces requests."
    plugin = "elasticsearch"
    catalog_label = "Index groups"
    fields = [
        FieldSpec(name="hosts", label="Hosts", kind="text", required=True, default="http://localhost:9200",
                  help="Comma-separated URLs."),
        FieldSpec(name="auth", label="Authentication", kind="select", default="none",
                  options=["none", "basic", "api_key"]),
        FieldSpec(name="username", label="Username (basic auth)", kind="text"),
        FieldSpec(name="password", label="Password (basic auth)", kind="password", secret=True),
        FieldSpec(name="api_key", label="API key", kind="password", secret=True),
        FieldSpec(name="verify_certs", label="Verify TLS certificates", kind="bool", default=True),
        FieldSpec(name="ca_certs", label="CA bundle path", kind="text", help="Optional path on the server."),
        *COMMON_FIELDS,
        FieldSpec(name="index_groups", label="Index groups", kind="catalog",
                  help="Optional descriptions of index groups and the fields to read. Described groups are searched for every incident."),
        # Search tuning
        FieldSpec(name="lookback", label="Time window searched", kind="text", default="24h", group="advanced",
                  help="Elasticsearch date math: 30m, 6h, 7d, 30d."),
        FieldSpec(name="timestamp_field", label="Timestamp field", kind="text", default="@timestamp", group="advanced"),
        FieldSpec(name="search_fields", label="Fields searched for ids and error text", kind="text",
                  default="message", group="advanced", help="Comma-separated. Default for groups without their own."),
        FieldSpec(name="fields", label="Fields returned to the agent", kind="text",
                  default="@timestamp, message", group="advanced", help="Comma-separated. Default for groups without their own."),
        FieldSpec(name="identifier_patterns", label="Id patterns (regex, one per line)", kind="textarea", group="advanced",
                  help="Ids to search for and trace, e.g. \\bORD-\\d+\\b. Default: mixed letter+digit tokens and long numbers."),
        FieldSpec(name="size_per_index", label="Lines read per service", kind="number", default=50, group="advanced"),
        FieldSpec(name="follow_identifiers", label="Request ids traced when the message has none", kind="number",
                  default=2, group="advanced"),
        FieldSpec(name="request_timeout", label="Request timeout (seconds)", kind="number", default=30, group="advanced"),
    ]

    def normalize(self, settings: dict, secrets: dict) -> dict:
        settings = dict(settings)
        if "indices_yaml" in settings:
            legacy = settings.pop("indices_yaml")
            settings.setdefault("index_groups", parse_yaml_mapping(legacy, "Index group descriptions"))
        settings = apply_defaults(self.fields, settings)
        if settings.get("auth") == "basic" and not settings.get("username"):
            raise ConnectorInvalid("Username is required for basic auth")
        groups = prune_index_groups(settings.get("index_groups") or {})
        try:
            parse_index_config(groups)
        except ValueError as error:
            raise ConnectorInvalid(f"Index groups: {error}")
        if groups:
            settings["index_groups"] = groups
        else:
            settings.pop("index_groups", None)
        for pattern in _lines(settings.get("identifier_patterns", "")):
            try:
                re.compile(pattern)
            except re.error as error:
                raise ConnectorInvalid(f"Id pattern {pattern!r} is not a valid regex: {error}")
        return settings

    def connection(self, settings: dict, secrets: dict) -> dict:
        auth = settings.get("auth", "none")
        return {
            "hosts": settings["hosts"],
            "username": settings.get("username") if auth == "basic" else None,
            "password": secrets.get("password") if auth == "basic" else None,
            "api_key": secrets.get("api_key") if auth == "api_key" else None,
            "verify_certs": settings.get("verify_certs", True),
            "ca_certs": settings.get("ca_certs"),
        }

    def _client(self, settings: dict, secrets: dict, timeout: int = 30):
        return create_client(request_timeout=timeout, max_retries=0, connection=self.connection(settings, secrets))

    def test(self, settings: dict, secrets: dict) -> str:
        client = self._client(settings, secrets, timeout=10)
        try:
            info = client.info()
            return f"Connected to cluster {info['cluster_name']!r} (Elasticsearch {info['version']['number']})."
        finally:
            client.close()

    def list_objects(self, settings: dict, secrets: dict) -> tuple[list[dict], bool]:
        client = self._client(settings, secrets)
        try:
            groups = index_groups(client, {})
        finally:
            client.close()
        groups.sort(key=lambda group: (-group["index_count"], group["prefix"]))
        return [
            {
                "name": group["prefix"],
                "detail": f"{group['index_count']} {'index' if group['index_count'] == 1 else 'indices'}",
                "comment": "",
            }
            for group in groups
        ], False

    def describe_object(self, settings: dict, secrets: dict, name: str) -> list[dict]:
        client = self._client(settings, secrets)
        try:
            group = next((g for g in index_groups(client, {}) if g["prefix"] == name), None)
            if group is None:
                raise ConnectorInvalid(f"Index group {name!r} not found")
            mapping = client.indices.get_mapping(index=group["latest_index"])
        finally:
            client.close()
        properties = next(iter(mapping.values()))["mappings"].get("properties", {})
        return [{**field, "indexed": False, "comment": ""} for field in flatten_mapping(properties)[:MAX_FIELDS]]

    def add_to_plugin(self, options: dict, name: str, settings: dict, secrets: dict) -> None:
        if options.get("connection"):
            raise ConnectorConflict("Only one Elasticsearch connector can be enabled at a time")
        options["connection"] = self.connection(settings, secrets)
        options["request_timeout"] = settings.get("request_timeout", 30)
        options["prefetch"] = {
            "lookback": settings.get("lookback", "24h"),
            "timestamp_field": settings.get("timestamp_field", "@timestamp"),
            "search_fields": _csv(settings.get("search_fields", "message")),
            "fields": _csv(settings.get("fields", "@timestamp, message")),
            "size_per_index": settings.get("size_per_index", 50),
            "follow_identifiers": settings.get("follow_identifiers", 2),
            **({"identifier_patterns": patterns} if (patterns := _lines(settings.get("identifier_patterns", ""))) else {}),
        }
        groups = _index_groups(settings)
        if groups:
            options["index_prefixes"] = groups
        if settings.get("instructions"):
            options["instructions"] = settings["instructions"]
