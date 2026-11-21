import logging

from fastapi import HTTPException, Response, status

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
