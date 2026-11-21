from datetime import datetime

from sqlalchemy import DateTime, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..db.session import Base

SINGLETON_ID = 1


class AppSettings(Base):
    """Agent settings (model, router, limits, instructions); a single row."""

    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=SINGLETON_ID)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)
    # Model provider API key, encrypted with APP_SECRET_KEY.
    secrets: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
