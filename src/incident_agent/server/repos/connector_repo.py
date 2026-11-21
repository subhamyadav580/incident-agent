from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Connector


class ConnectorRepo:
    def __init__(self, session: Session):
        self.session = session

    def list_all(self) -> list[Connector]:
        return list(self.session.scalars(select(Connector).order_by(Connector.type, Connector.name)))

    def list_enabled(self) -> list[Connector]:
        return list(self.session.scalars(select(Connector).where(Connector.enabled.is_(True))))

    def get(self, connector_id: int) -> Optional[Connector]:
        return self.session.get(Connector, connector_id)

    def get_by_name(self, name: str) -> Optional[Connector]:
        return self.session.scalar(select(Connector).where(Connector.name == name))

    def add(self, connector: Connector) -> Connector:
        self.session.add(connector)
        self.session.commit()
        self.session.refresh(connector)
        return connector

    def save(self, connector: Connector) -> Connector:
        self.session.commit()
        self.session.refresh(connector)
        return connector

    def delete(self, connector: Connector) -> None:
        self.session.delete(connector)
        self.session.commit()
