import logging
import time

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