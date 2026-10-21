import os
from typing import Optional

from elasticsearch import Elasticsearch


# Connection settings come from the environment so secrets never live in config files:
#   ES_HOSTS          comma-separated URLs (default http://localhost:9200)
#   ES_API_KEY        API key auth, or
#   ES_USERNAME / ES_PASSWORD   basic auth
#   ES_VERIFY_CERTS   "false" to skip TLS verification (default true)
#   ES_CA_CERTS       path to a CA bundle
def create_client(request_timeout: int = 30, max_retries: int = 3) -> Elasticsearch:
    hosts = [host.strip() for host in os.environ.get("ES_HOSTS", "http://localhost:9200").split(",") if host.strip()]

    api_key: Optional[str] = os.environ.get("ES_API_KEY") or None
    username = os.environ.get("ES_USERNAME")
    password = os.environ.get("ES_PASSWORD")

    kwargs = {}
    if api_key:
        kwargs["api_key"] = api_key
    elif username and password:
        kwargs["basic_auth"] = (username, password)

    if os.environ.get("ES_CA_CERTS"):
        kwargs["ca_certs"] = os.environ["ES_CA_CERTS"]
    if os.environ.get("ES_VERIFY_CERTS", "true").strip().lower() in {"0", "false", "no"}:
        kwargs["verify_certs"] = False

    return Elasticsearch(
        hosts,
        request_timeout=request_timeout,
        max_retries=max_retries,
        retry_on_timeout=True,
        **kwargs,
    )
