from typing import Optional

from elasticsearch import Elasticsearch


# Connection settings (hosts, auth, TLS) are stored per connector in the app database.
def create_client(
    request_timeout: int = 30,
    max_retries: int = 3,
    connection: Optional[dict] = None,
) -> Elasticsearch:
    connection = connection or {}

    hosts = connection.get("hosts") or "http://localhost:9200"
    if isinstance(hosts, str):
        hosts = [host.strip() for host in hosts.split(",") if host.strip()]

    kwargs = {}
    if connection.get("api_key"):
        kwargs["api_key"] = connection["api_key"]
    elif connection.get("username") and connection.get("password"):
        kwargs["basic_auth"] = (connection["username"], connection["password"])

    if connection.get("ca_certs"):
        kwargs["ca_certs"] = connection["ca_certs"]
    if connection.get("verify_certs") is False:
        kwargs["verify_certs"] = False

    return Elasticsearch(
        hosts,
        request_timeout=request_timeout,
        max_retries=max_retries,
        retry_on_timeout=True,
        **kwargs,
    )
