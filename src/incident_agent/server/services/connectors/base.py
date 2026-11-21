from typing import Any, Protocol

import yaml

from ...schemas.connector import FieldSpec
from .errors import ConnectorInvalid

COMMON_FIELDS = [
    FieldSpec(
        name="instructions", label="Instructions for the agent", kind="textarea",
        help="Optional. Team knowledge about this source, e.g. what ids look like or what to avoid.",
    ),
]


class ConnectorType(Protocol):
    """One kind of data source the UI can configure (Strategy; see registry.py)."""

    type: str
    label: str
    description: str
    fields: list[FieldSpec]
    plugin: str  # the incident_agent plugin that serves this type
    catalog_label: str  # what list_objects returns, e.g. "Tables"

    def normalize(self, settings: dict, secrets: dict) -> dict:
        """Validate settings; return them with defaults applied. Raise ConnectorInvalid."""

    def test(self, settings: dict, secrets: dict) -> str:
        """Connect and return a short success message. Raise on failure."""

    def add_to_plugin(self, options: dict, name: str, settings: dict, secrets: dict) -> None:
        """Merge this connector into its plugin's options (several connectors may share one plugin)."""

    def list_objects(self, settings: dict, secrets: dict) -> tuple[list[dict], bool]:
        """Tables / index groups the user can describe: ([{name, detail, comment}], truncated)."""

    def describe_object(self, settings: dict, secrets: dict, name: str) -> list[dict]:
        """Columns / fields of one object: [{name, type, indexed, comment}]."""


def apply_defaults(fields: list[FieldSpec], settings: dict) -> dict:
    known = {field.name for field in fields if not field.secret}
    unknown = set(settings) - known
    if unknown:
        raise ConnectorInvalid(f"Unknown settings: {', '.join(sorted(unknown))}")

    result = {}
    for field in fields:
        if field.secret:
            continue
        if field.show_if and not all(settings.get(key, _default(fields, key)) in values for key, values in field.show_if.items()):
            continue  # hidden by another field's value: ignore it
        value = settings.get(field.name)
        if value in (None, "") and field.default is not None:
            value = field.default
        if field.required and value in (None, ""):
            raise ConnectorInvalid(f"{field.label} is required")
        if field.kind == "number" and value not in (None, ""):
            try:
                value = int(value)
            except (TypeError, ValueError):
                raise ConnectorInvalid(f"{field.label} must be a number")
        if field.kind == "catalog":
            if value in (None, ""):
                continue
            if not isinstance(value, dict):
                raise ConnectorInvalid(f"{field.label} must be an object")
        if field.kind == "select" and value not in (None, "") and field.options and value not in field.options:
            raise ConnectorInvalid(f"{field.label} must be one of {field.options}")
        if value not in (None, ""):
            result[field.name] = value
    return result


def parse_yaml_mapping(text: str, label: str) -> dict[str, Any]:
    if not text or not text.strip():
        return {}
    try:
        value = yaml.safe_load(text)
    except yaml.YAMLError as error:
        raise ConnectorInvalid(f"{label}: invalid YAML ({error})")
    if not isinstance(value, dict):
        raise ConnectorInvalid(f"{label} must be a YAML mapping")
    return value


def _default(fields: list[FieldSpec], name: str):
    return next((field.default for field in fields if field.name == name), None)
