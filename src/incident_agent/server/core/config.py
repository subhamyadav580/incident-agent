import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
    # Local PostgreSQL holding the app's own data (connectors and their credentials).
    database_url: str
    # Fernet key encrypting stored credentials. Generate with `incident-agent-server --generate-key`.
    secret_key: str
    host: str
    port: int


@lru_cache
def get_settings() -> Settings:
    return Settings(
        database_url=os.environ.get("APP_DATABASE_URL", "postgresql://localhost:5432/incident_agent"),
        secret_key=os.environ.get("APP_SECRET_KEY", ""),
        host=os.environ.get("APP_HOST", "127.0.0.1"),
        port=int(os.environ.get("APP_PORT", "8000")),
    )
