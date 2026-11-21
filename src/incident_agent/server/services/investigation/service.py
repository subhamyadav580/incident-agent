import json
import logging
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from incident_agent.app import build_agent

from ...models import Investigation
from ...repos.investigation_repo import InvestigationRepo
from ...schemas.investigation import HourBucket, InvestigationOut, InvestigationSummary, OverviewOut
from ..connectors.service import ConnectorService
from ..settings.service import SettingsService
from .errors import InvestigationNotFound
from .evidence import summarize_evidence

logger = logging.getLogger(__name__)

_SUMMARY = re.compile(r"^##\s*Summary\s*\n+(.+?)(?:\n\n|\n#|$)", re.S | re.M | re.I)


def headline(report: str, limit: int = 180) -> str:
    """First sentence of the report's Summary section (or of the report)."""
    match = _SUMMARY.search(report)
    text = (match.group(1) if match else report).strip()
    text = re.sub(r"[*_`#>]", "", text).replace("\n", " ")
    sentence = re.split(r"(?<=[.!?])\s", text, maxsplit=1)[0]
    return sentence[:limit] + ("…" if len(sentence) > limit else "")


class InvestigationService:
    """Builds the agent from the stored settings and connectors, runs it and keeps the history."""

    def __init__(self, connectors: ConnectorService, settings: SettingsService, repo: InvestigationRepo):
        self.connectors = connectors
        self.settings = settings
        self.repo = repo

    def investigate(self, message: str, listener=None, run_id: Optional[str] = None) -> InvestigationOut:
        """Run an investigation; `listener(phase, index, span)` receives each step as it happens."""
        run_id = run_id or str(uuid.uuid4())
        plugins_config = self.connectors.plugins_config()
        record = Investigation(id=run_id, message=message, connectors=sorted(plugins_config))

        started = time.monotonic()
        try:
            with build_agent(self.settings.agent_config(), plugins_config=plugins_config) as agent:
                result = agent.investigate_with_details(message, run_id=run_id, listener=listener)
        except Exception as error:
            record.status, record.error = "failed", str(error)
            record.duration_ms = int((time.monotonic() - started) * 1000)
            self.repo.add(record)
            raise

        record.intent = result["intent"]
        record.report = result["report"]
        record.steps = result["steps"]
        record.duration_ms = int((time.monotonic() - started) * 1000)
        record.evidence = summarize_evidence(result["evidence"])
        record.trace = json.loads(json.dumps(result.get("trace", []), default=str))
        return self._out(self.repo.add(record))

    def get(self, investigation_id: str) -> InvestigationOut:
        record = self.repo.get(investigation_id)
        if record is None:
            raise InvestigationNotFound(f"Investigation {investigation_id} not found")
        return self._out(record)

    def delete(self, investigation_id: str) -> None:
        record = self.repo.get(investigation_id)
        if record is None:
            raise InvestigationNotFound(f"Investigation {investigation_id} not found")
        self.repo.delete(record)

    def recent(self, limit: int = 50) -> list[InvestigationSummary]:
        return [self._summary(record) for record in self.repo.list_recent(limit)]

    def overview(self) -> OverviewOut:
        now = datetime.now(timezone.utc)
        rows = self.repo.counts_since(now - timedelta(hours=24))
        total = sum(count for _, _, count, _ in rows)
        by_intent: dict[str, int] = {}
        for intent, _, count, _ in rows:
            by_intent[intent or "unknown"] = by_intent.get(intent or "unknown", 0) + count
        weighted = sum((avg or 0) * count for _, _, count, avg in rows)
        return OverviewOut(
            investigations_24h=total,
            failed_24h=sum(count for _, status, count, _ in rows if status == "failed"),
            by_intent_24h=by_intent,
            avg_duration_ms_24h=int(weighted / total) if total else None,
            per_hour_24h=self._hourly(now),
            recent=self.recent(8),
        )

    def _hourly(self, now: datetime) -> list[HourBucket]:
        first_hour = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=23)
        counts = {hour.replace(tzinfo=timezone.utc): (total, failed) for hour, total, failed in self.repo.hourly_since(first_hour)}
        buckets = []
        for offset in range(24):
            hour = first_hour + timedelta(hours=offset)
            total, failed = counts.get(hour, (0, 0))
            buckets.append(HourBucket(t=hour, total=total, failed=failed))
        return buckets

    def _summary(self, record: Investigation) -> InvestigationSummary:
        return InvestigationSummary(
            id=record.id,
            message=record.message,
            headline=headline(record.report) if record.report else (record.error[:180] or ""),
            intent=record.intent,
            status=record.status,
            steps=record.steps,
            duration_ms=record.duration_ms,
            created_at=record.created_at,
        )

    def _out(self, record: Investigation) -> InvestigationOut:
        return InvestigationOut(
            **self._summary(record).model_dump(),
            report=record.report,
            error=record.error,
            connectors=record.connectors or [],
            evidence=record.evidence or {},
            trace=record.trace or [],
        )
