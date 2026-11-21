"""
Connector types the UI can configure (Factory over ConnectorType strategies).
Adding a type: write services/connectors/<type>.py and register it here.
"""
from .base import ConnectorType
from .elasticsearch import ElasticsearchConnector
from .errors import ConnectorInvalid
from .postgres import PostgresConnector

CONNECTOR_TYPES: dict[str, ConnectorType] = {
    connector.type: connector
    for connector in (PostgresConnector(), ElasticsearchConnector())
}


def get_connector_type(type_name: str) -> ConnectorType:
    try:
        return CONNECTOR_TYPES[type_name]
    except KeyError:
        raise ConnectorInvalid(f"Unknown connector type {type_name!r}. Available: {', '.join(CONNECTOR_TYPES)}")
