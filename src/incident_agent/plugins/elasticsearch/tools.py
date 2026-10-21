from typing import Optional

from elasticsearch import Elasticsearch
from langchain_core.tools import BaseTool, tool

from .indices import IndexGroupConfig, index_groups


def build_tools(es: Elasticsearch, index_config: dict[str, IndexGroupConfig]) -> list[BaseTool]:
    """Create the Elasticsearch tools bound to one client and index config."""

    @tool
    def list_es_indices():
        """
        List Elasticsearch index groups with a description of what each holds.

        Indices are grouped by name prefix (dates stripped). Each entry has:
          - prefix: the group name
          - pattern: pass this as index_name to get_index_mapping / search_on_index
            to cover every index in the group
          - latest_index: the newest index in the group, for searching recent data only
          - index_count, description
          - fields (when configured): the fields that matter in this group; request
            only these via "_source" in search_on_index
        Use the descriptions to pick the right group before calling get_index_mapping.
        """
        listed = []
        for group in index_groups(es, index_config):
            config = group.pop("config")
            if config.fields:
                group["fields"] = list(config.fields)
            listed.append(group)
        return listed

    @tool
    def get_index_mapping(index_name: str):
        """
        Fetch the field mapping of an Elasticsearch index.
        Always call this before search_on_index to understand the available fields and their types,
        so you can build an accurate query DSL.

        Args:
            index_name: An index name or a group pattern from list_es_indices.
                        For a pattern, the newest matching index's mapping is returned.

        Returns a dict of field names and their types (e.g. keyword, text, integer, nested).
        """
        mapping = es.indices.get_mapping(index=index_name)
        if len(mapping) > 1:
            created = es.indices.get_settings(index=index_name, name="index.creation_date")
            newest = max(mapping, key=lambda name: int(created[name]["settings"]["index"]["creation_date"]))
        else:
            newest = next(iter(mapping))
        properties = mapping[newest]["mappings"].get("properties", {})
        return {field: meta.get("type", "object/nested") for field, meta in properties.items()}

    @tool
    def search_on_index(index_name: str, query: Optional[dict] = None):
        """
        Execute an Elasticsearch query on a specific index and return matching documents.

        Args:
            index_name: An index name or a group pattern from list_es_indices.
            query: A valid Elasticsearch search body (query DSL dict), e.g.
                   {"query": {...}, "size": 20, "sort": [...]}.

        Returns the raw Elasticsearch response including hits, scores, and _source documents.
        """
        if not query:
            raise ValueError("query is required. Call get_index_mapping() first to see available fields, then retry with a valid Elasticsearch query DSL dict.")
        data = es.search(index=index_name, body=query)
        return data.body

    return [list_es_indices, get_index_mapping, search_on_index]
