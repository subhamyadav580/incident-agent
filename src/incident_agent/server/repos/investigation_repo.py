from datetime import datetime
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Investigation


class InvestigationRepo:
    def __init__(self, session: Session):
        self.session = session

    def add(self, investigation: Investigation) -> Investigation:
        self.session.add(investigation)
        self.session.commit()
        self.session.refresh(investigation)
        return investigation

    def get(self, investigation_id: str) -> Optional[Investigation]:
        return self.session.get(Investigation, investigation_id)

    def list_recent(self, limit: int) -> list[Investigation]:
        return list(self.session.scalars(
            select(Investigation).order_by(Investigation.created_at.desc()).limit(limit)
        ))

    def delete(self, investigation: Investigation) -> None:
        self.session.delete(investigation)
        self.session.commit()

    def counts_since(self, since: datetime) -> list[tuple[Optional[str], str, int, Optional[float]]]:
        """(intent, status, count, average duration ms) for investigations since `since`."""
        rows = self.session.execute(
            select(
                Investigation.intent,
                Investigation.status,
                func.count(),
                func.avg(Investigation.duration_ms),
            )
            .where(Investigation.created_at >= since)
            .group_by(Investigation.intent, Investigation.status)
        )
        return [tuple(row) for row in rows]

    def hourly_since(self, since: datetime) -> list[tuple[datetime, int, int]]:
        """(UTC hour, total, failed) buckets for investigations since `since`."""
        # Truncate in UTC: the session timezone may be +05:30, which would put
        # hour boundaries on :30.
        hour = func.date_trunc("hour", func.timezone("UTC", Investigation.created_at))
        rows = self.session.execute(
            select(
                hour,
                func.count(),
                func.count().filter(Investigation.status == "failed"),
            )
            .where(Investigation.created_at >= since)
            .group_by(hour)
            .order_by(hour)
        )
        return [tuple(row) for row in rows]
