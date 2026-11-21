import json
import logging
import queue
import threading
import uuid
from typing import Callable, ContextManager

from fastapi import HTTPException, Response, status
from fastapi.responses import StreamingResponse

from ...core.crypto import SecretBoxError
from ...schemas.investigation import InvestigationOut, InvestigationRequest, InvestigationSummary, OverviewOut
from ...services.connectors.errors import ConnectorError
from ...services.investigation.errors import InvestigationNotFound
from ...services.investigation.service import InvestigationService

logger = logging.getLogger(__name__)


def run_investigation(service: InvestigationService, request: InvestigationRequest) -> InvestigationOut:
    try:
        return service.investigate(request.message)
    except (ConnectorError, SecretBoxError) as error:
        raise HTTPException(status.HTTP_409_CONFLICT, str(error))
    except Exception as error:
        logger.exception("Investigation failed")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Investigation failed: {error}")


def list_investigations(service: InvestigationService, limit: int) -> list[InvestigationSummary]:
    return service.recent(limit)


def get_investigation(service: InvestigationService, investigation_id: str) -> InvestigationOut:
    try:
        return service.get(investigation_id)
    except InvestigationNotFound as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(error))


def delete_investigation(service: InvestigationService, investigation_id: str) -> Response:
    try:
        service.delete(investigation_id)
    except InvestigationNotFound as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(error))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def overview(service: InvestigationService) -> OverviewOut:
    return service.overview()


KEEPALIVE_SECONDS = 15


def _line(event: dict) -> str:
    return json.dumps(event, ensure_ascii=False, default=str) + "\n"


def stream_investigation(
    request: InvestigationRequest,
    open_service: Callable[[], ContextManager[InvestigationService]],
) -> StreamingResponse:
    """
    Run an investigation and stream newline-delimited JSON events:
    {"type": "run", run_id} first, {"type": "step", phase: start|end, index, span}
    as each step happens, then {"type": "done", investigation} or {"type": "error", message}.
    The run continues and is saved even if the client disconnects.
    """
    events: queue.Queue = queue.Queue()
    run_id = str(uuid.uuid4())

    def listener(phase: str, index: int, span: dict) -> None:
        # Serialize now: the span dict keeps changing until the step ends.
        events.put(_line({"type": "step", "phase": phase, "index": index, "span": span}))

    def work() -> None:
        try:
            with open_service() as service:
                result = service.investigate(request.message, listener=listener, run_id=run_id)
            events.put(_line({"type": "done", "investigation": result.model_dump(mode="json")}))
        except Exception as error:
            logger.exception("Streamed investigation failed")
            events.put(_line({"type": "error", "message": str(error) or repr(error), "run_id": run_id}))
        finally:
            events.put(None)

    threading.Thread(target=work, name=f"investigation-{run_id[:8]}", daemon=True).start()

    def body():
        yield _line({"type": "run", "run_id": run_id})
        while True:
            try:
                item = events.get(timeout=KEEPALIVE_SECONDS)
            except queue.Empty:
                yield _line({"type": "ping"})  # keeps proxies from closing a quiet connection
                continue
            if item is None:
                return
            yield item

    return StreamingResponse(
        body(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
