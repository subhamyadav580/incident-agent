from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class InvestigationRequest(BaseModel):
    message: str = Field(min_length=1, max_length=20_000)


class InvestigationSummary(BaseModel):
    id: str
    message: str
    headline: str = Field(description="First sentence of the report's summary")
    intent: Optional[str]
    status: str
    steps: int
    duration_ms: int
    created_at: datetime


class InvestigationOut(InvestigationSummary):
    report: str
    error: str
    connectors: list[str]
    evidence: dict[str, Any] = Field(
        description="services: per-service error counts and histograms; traces; records: database rows"
    )
    trace: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Timed steps: {kind: intent|prefetch|model|tool|limit, name, start_ms, duration_ms, status, detail}",
    )


class HourBucket(BaseModel):
    t: datetime
    total: int
    failed: int


class OverviewOut(BaseModel):
    investigations_24h: int
    failed_24h: int
    by_intent_24h: dict[str, int]
    avg_duration_ms_24h: Optional[int]
    per_hour_24h: list[HourBucket] = Field(description="24 hourly buckets, oldest first, zero-filled")
    recent: list[InvestigationSummary]
