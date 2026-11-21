import logging
from functools import lru_cache

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from ..core.config import get_settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


@lru_cache
def get_engine() -> Engine:
    return create_engine(get_settings().database_url, pool_pre_ping=True)


@lru_cache
def get_sessionmaker() -> sessionmaker:
    return sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)


def ensure_database() -> None:
    """Create the app database if it does not exist yet."""
    url = make_url(get_settings().database_url)
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as connection:
            exists = connection.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": url.database}
            ).scalar()
            if not exists:
                logger.info("Creating database %s", url.database)
                connection.execute(text(f'CREATE DATABASE "{url.database}"'))
    finally:
        admin.dispose()


def init_db() -> None:
    from .. import models  # noqa: F401  registers the ORM models

    ensure_database()
    Base.metadata.create_all(get_engine())
