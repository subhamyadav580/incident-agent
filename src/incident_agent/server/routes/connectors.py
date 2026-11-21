from fastapi import APIRouter, Depends, Response

from ..api.handlers import connectors as handlers
from ..dependencies import get_connector_service
from ..schemas.connector import (
    CatalogDetail,
    CatalogList,
    CatalogRequest,
    ConnectorCreate,
    ConnectorOut,
    ConnectorTestRequest,
    ConnectorTestResult,
    ConnectorTypeOut,
    ConnectorUpdate,
)
from ..services.connectors.service import ConnectorService

router = APIRouter(prefix="/api", tags=["connectors"])


@router.get("/connector-types", response_model=list[ConnectorTypeOut])
def list_types(service: ConnectorService = Depends(get_connector_service)):
    return handlers.list_types(service)


@router.get("/connectors", response_model=list[ConnectorOut])
def list_connectors(service: ConnectorService = Depends(get_connector_service)):
    return handlers.list_connectors(service)


@router.post("/connectors", response_model=ConnectorOut, status_code=201)
def create_connector(data: ConnectorCreate, response: Response, service: ConnectorService = Depends(get_connector_service)):
    return handlers.create_connector(service, data, response)


@router.post("/connectors/test", response_model=ConnectorTestResult)
def test_connector(request: ConnectorTestRequest, service: ConnectorService = Depends(get_connector_service)):
    return handlers.test_connector(service, request)


@router.post("/connectors/catalog", response_model=CatalogList)
def list_catalog(request: CatalogRequest, service: ConnectorService = Depends(get_connector_service)):
    return handlers.list_catalog(service, request)


@router.post("/connectors/catalog/describe", response_model=CatalogDetail)
def describe_catalog_object(request: CatalogRequest, service: ConnectorService = Depends(get_connector_service)):
    return handlers.describe_catalog_object(service, request)


@router.get("/connectors/{connector_id}", response_model=ConnectorOut)
def get_connector(connector_id: int, service: ConnectorService = Depends(get_connector_service)):
    return handlers.get_connector(service, connector_id)


@router.get("/connectors/{connector_id}/health", response_model=ConnectorTestResult)
def check_connector(connector_id: int, service: ConnectorService = Depends(get_connector_service)):
    return handlers.check_connector(service, connector_id)


@router.patch("/connectors/{connector_id}", response_model=ConnectorOut)
def update_connector(connector_id: int, data: ConnectorUpdate, service: ConnectorService = Depends(get_connector_service)):
    return handlers.update_connector(service, connector_id, data)


@router.delete("/connectors/{connector_id}", status_code=204)
def delete_connector(connector_id: int, service: ConnectorService = Depends(get_connector_service)):
    return handlers.delete_connector(service, connector_id)
