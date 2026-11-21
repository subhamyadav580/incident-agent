import logging
from threading import Lock
from typing import Dict, Optional

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker, Session

logger = logging.getLogger(__name__)

def _safe_url(url: str) -> str:
    """Render a connection URL with the password masked, for logging."""
    try:
        return make_url(url).render_as_string(hide_password=True)
    except Exception:
        return "<unparseable url>"


class Database:
    """One lazily-connected engine for a named database."""

    def __init__(self, name: str, url: str, description: str = ""):
        self.name = name
        self.url = url
        self.description = description
        self.engine = None
        self.SessionLocal = None
        self._init_lock = Lock()

    def _ensure_connected(self) -> None:
        if self.engine is not None:
            return
        with self._init_lock:
            if self.engine is not None:
                return
            logger.info(
                "Connecting to database %r: %s", self.name, _safe_url(self.url)
            )
            self.engine = create_engine(
                self.url,
                echo=False,
                pool_pre_ping=True,
                pool_size=10,
                max_overflow=20,
                pool_recycle=300,
                connect_args={
                    "connect_timeout": 10,
                    "keepalives": 1,
                    "keepalives_idle": 60,
                    "keepalives_interval": 10,
                    "keepalives_count": 5,
                },
            )
            self.SessionLocal = sessionmaker(
                autocommit=False,
                autoflush=False,
                bind=self.engine,
            )
            logger.info("Database engine %r initialized successfully", self.name)

    def get_session(self) -> Session:
        self._ensure_connected()
        return self.SessionLocal()

    def close(self):
        if self.engine:
            self.engine.dispose()
            self.engine = None
            self.SessionLocal = None
            logger.info("Database engine %r disposed", self.name)


class DatabaseRegistry:
    """The set of named databases the tools can query."""

    def __init__(self, configs: Dict[str, Dict[str, str]], default: Optional[str] = None):
        if not configs:
            raise RuntimeError("No database configured. Add a PostgreSQL connector.")

        self.databases = {
            name: Database(name, config["url"], config.get("description", ""))
            for name, config in configs.items()
        }

        default = (default or "").strip().lower()
        if default and default not in self.databases:
            raise RuntimeError(
                f"Default database {default!r} is not configured. "
                f"Available: {', '.join(sorted(self.databases))}"
            )
        self.default = default or ("default" if "default" in self.databases else sorted(self.databases)[0])

    def get(self, name: Optional[str] = None) -> Database:
        """Resolve a database by name, falling back to the configured default."""
        key = (name or self.default).strip().lower()

        if key not in self.databases:
            raise ValueError(
                f"Unknown database {key!r}. "
                f"Available: {', '.join(sorted(self.databases))}"
            )

        return self.databases[key]

    def close_all(self) -> None:
        for database in self.databases.values():
            database.close()
