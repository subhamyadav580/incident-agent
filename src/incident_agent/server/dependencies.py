from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from .core.crypto import SecretBox, SecretBoxError, get_secret_box
from .db.session import get_sessionmaker
from .repos.connector_repo import ConnectorRepo
from .repos.investigation_repo import InvestigationRepo
from .repos.settings_repo import SettingsRepo
from .services.connectors.service import ConnectorService
from .services.investigation.service import InvestigationService
from .services.settings.service import SettingsService


def get_db() -> Iterator[Session]:
    session = get_sessionmaker()()
    try:
        yield session
    finally:
        session.close()


def get_box() -> SecretBox:
    try:
        return get_secret_box()
    except SecretBoxError as error:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(error))


def get_connector_service(db: Session = Depends(get_db), box: SecretBox = Depends(get_box)) -> ConnectorService:
    return ConnectorService(ConnectorRepo(db), box)


def get_settings_service(db: Session = Depends(get_db), box: SecretBox = Depends(get_box)) -> SettingsService:
    return SettingsService(SettingsRepo(db), box)


def get_investigation_service(
    db: Session = Depends(get_db),
    connectors: ConnectorService = Depends(get_connector_service),
    settings: SettingsService = Depends(get_settings_service),
) -> InvestigationService:
    return InvestigationService(connectors, settings, InvestigationRepo(db))


def build_investigation_service(session: Session, box: SecretBox) -> InvestigationService:
    return InvestigationService(
        ConnectorService(ConnectorRepo(session), box),
        SettingsService(SettingsRepo(session), box),
        InvestigationRepo(session),
    )


@contextmanager
def investigation_service_session() -> Iterator[InvestigationService]:
    """An InvestigationService with its own session, for work outside the request (streaming)."""
    session = get_sessionmaker()()
    try:
        yield build_investigation_service(session, get_secret_box())
    finally:
        session.close()
