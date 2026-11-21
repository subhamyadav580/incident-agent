from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..db.session import Base


class Investigation(Base):
    """One message sent to the agent and its outcome."""

    __tablename__ = "investigations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # the run id
    message: Mapped[str] = mapped_column(Text)
    intent: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="completed")  # completed | failed
    report: Mapped[str] = mapped_column(Text, default="")
    error: Mapped[str] = mapped_column(Text, default="")
    steps: Mapped[int] = mapped_column(Integer, default=0)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    connectors: Mapped[list] = mapped_column(JSONB, default=list)
    # Condensed prefetch evidence for the UI: affected services, traces, records.
    evidence: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
