from fastapi import APIRouter, Depends, Query

from ..api.handlers import investigations as handlers
from ..dependencies import get_investigation_service
from ..schemas.investigation import InvestigationOut, InvestigationRequest, InvestigationSummary, OverviewOut
from ..services.investigation.service import InvestigationService

router = APIRouter(prefix="/api", tags=["investigations"])


# Sync def: FastAPI runs it in a worker thread, so a 10-30s investigation
# doesn't block other requests.
@router.post("/investigations", response_model=InvestigationOut)
def run_investigation(request: InvestigationRequest, service: InvestigationService = Depends(get_investigation_service)):
    return handlers.run_investigation(service, request)


@router.get("/investigations", response_model=list[InvestigationSummary])
def list_investigations(limit: int = Query(50, ge=1, le=500), service: InvestigationService = Depends(get_investigation_service)):
    return handlers.list_investigations(service, limit)


@router.get("/investigations/{investigation_id}", response_model=InvestigationOut)
def get_investigation(investigation_id: str, service: InvestigationService = Depends(get_investigation_service)):
    return handlers.get_investigation(service, investigation_id)


@router.delete("/investigations/{investigation_id}", status_code=204)
def delete_investigation(investigation_id: str, service: InvestigationService = Depends(get_investigation_service)):
    return handlers.delete_investigation(service, investigation_id)


@router.get("/overview", response_model=OverviewOut)
def overview(service: InvestigationService = Depends(get_investigation_service)):
    return handlers.overview(service)
