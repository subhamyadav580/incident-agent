import logging
import time
from contextlib import contextmanager
from typing import Iterator

logger = logging.getLogger("incident_agent")


def trace_event(
    run_id: str,
    event: str,
    **attributes,
) -> None:
    logger.info(
        "run_id=%s event=%s attributes=%s",
        run_id,
        event,
        attributes,
    )


def timed_call(function, *args, **kwargs):
    started = time.monotonic()

    try:
        return function(*args, **kwargs)
    finally:
        logger.info(
            "operation=%s duration_seconds=%.3f",
            function.__name__,
            time.monotonic() - started,
        )

PREVIEW_CHARS = 600


def preview(value, limit: int = PREVIEW_CHARS) -> str:
    text = value if isinstance(value, str) else repr(value)
    return text if len(text) <= limit else text[:limit] + f"… [{len(text) - limit} more chars]"


class RunTrace:
    """
    Timed spans of one run (classify, prefetch, model steps, tool calls) for
    showing how an investigation worked. Each span:
    {kind, name, start_ms, duration_ms, status: ok|error, detail: {...}}.
    """

    def __init__(self, run_id: str):
        self.run_id = run_id
        self.started = time.monotonic()
        self.spans: list[dict] = []

    @contextmanager
    def span(self, kind: str, name: str, **detail) -> Iterator[dict]:
        record = {
            "kind": kind,
            "name": name,
            "start_ms": int((time.monotonic() - self.started) * 1000),
            "duration_ms": 0,
            "status": "ok",
            "detail": detail,
        }
        self.spans.append(record)
        began = time.monotonic()
        try:
            yield record
        except Exception as error:
            record["status"] = "error"
            record["detail"]["error"] = preview(str(error) or repr(error), 300)
            raise
        finally:
            record["duration_ms"] = int((time.monotonic() - began) * 1000)
            trace_event(self.run_id, f"{kind}_finished", name=name, duration_ms=record["duration_ms"], status=record["status"])
