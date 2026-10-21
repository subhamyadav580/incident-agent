import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import yaml
from elasticsearch import Elasticsearch

logger = logging.getLogger(__name__)

# Date suffixes commonly used for time-based indices: 2026.10.21, 21.10.2026,
# 2026-10-21, 2026_06_19_15_24_48, optionally followed by a rollover counter (-000797).
_DATED_INDEX = re.compile(r"^(.*?)([-_.])\d{2,4}[._-]\d{2}[._-]\d{2,4}(?:[-_.].*)?$")
_DATA_STREAM_PREFIX = ".ds-"


@dataclass(frozen=True)
class IndexGroupConfig:
    """
    What the agent knows about one index group, from the index config file.

    fields:          fields returned from each hit (None: use the prefetch default)
    search_fields:   fields the message/identifiers are matched against (None: default)
    timestamp_field: field for the time range and sort (None: default)
    """

    description: str = ""
    fields: Optional[tuple[str, ...]] = None
    search_fields: Optional[tuple[str, ...]] = None
    timestamp_field: Optional[str] = None


def _as_fields(value, prefix: str, key: str) -> Optional[tuple[str, ...]]:
    if value is None:
        return None
    if isinstance(value, str):
        return (value,)
    if isinstance(value, list) and all(isinstance(field, str) for field in value):
        return tuple(value)
    raise ValueError(f"index_prefixes.{prefix}.{key} must be a field name or a list of field names")


def _parse_group(prefix: str, value) -> IndexGroupConfig:
    # Short form: `prefix: "description"`.
    if value is None or isinstance(value, str):
        return IndexGroupConfig(description=(value or "").strip())

    if not isinstance(value, dict):
        raise ValueError(f"index_prefixes.{prefix} must be a description string or a mapping")

    unknown = set(value) - {"description", "fields", "search_fields", "timestamp_field"}
    if unknown:
        raise ValueError(f"index_prefixes.{prefix} has unknown keys: {', '.join(sorted(unknown))}")

    return IndexGroupConfig(
        description=(value.get("description") or "").strip(),
        fields=_as_fields(value.get("fields"), prefix, "fields"),
        search_fields=_as_fields(value.get("search_fields"), prefix, "search_fields"),
        timestamp_field=value.get("timestamp_field"),
    )


def load_index_config(path: Optional[str]) -> dict[str, IndexGroupConfig]:
    """
    Read `index_prefixes` from a YAML file. Each entry is either a description
    string or a mapping with description / fields / search_fields / timestamp_field.

    Only described prefixes are searched by the prefetch step, so the file doubles
    as the list of indices the agent should look at first.
    """
    if not path:
        return {}
    file = Path(path)
    if not file.exists():
        logger.warning("Index config file %s not found; no index groups are described", file)
        return {}
    config = yaml.safe_load(file.read_text(encoding="utf-8")) or {}
    return {
        prefix: _parse_group(prefix, value)
        for prefix, value in (config.get("index_prefixes") or {}).items()
    }


def group_index(index_name: str) -> Optional[tuple[str, str]]:
    """
    Map an index to (prefix, search_pattern), or None for internal indices.

    Data stream backing indices (.ds-<stream>-<date>-<n>) map to the stream name,
    which is directly searchable. Dated indices map to "<prefix><sep>*".
    """
    if index_name.startswith(_DATA_STREAM_PREFIX):
        stream = _DATED_INDEX.match(index_name[len(_DATA_STREAM_PREFIX):])
        return (stream.group(1), stream.group(1)) if stream else None
    if index_name.startswith("."):
        return None
    dated = _DATED_INDEX.match(index_name)
    if dated:
        prefix, separator = dated.groups()
        return prefix, f"{prefix}{separator}*"
    return index_name, index_name


def index_groups(es: Elasticsearch, index_config: dict[str, IndexGroupConfig]) -> list[dict]:
    """
    Group the cluster's indices by prefix, attaching configured descriptions.

    Each entry carries its IndexGroupConfig under "config" for internal use;
    strip it before showing the list to the model.
    """
    groups = {}
    for item in es.cat.indices(format="json", h="index,creation.date"):
        grouped = group_index(item['index'])
        if grouped is None:
            continue
        prefix, pattern = grouped
        group = groups.setdefault(prefix, {"pattern": pattern, "indices": []})
        group["indices"].append(item)

    result = []
    for prefix, group in sorted(groups.items()):
        config = index_config.get(prefix, IndexGroupConfig())
        result.append({
            "prefix": prefix,
            "pattern": group["pattern"],
            "description": config.description,
            "index_count": len(group["indices"]),
            # Names mix date formats (DD.MM.YYYY sorts wrong), so use creation time.
            "latest_index": max(group["indices"], key=lambda item: int(item['creation.date']))['index'],
            "config": config,
        })
    return result
