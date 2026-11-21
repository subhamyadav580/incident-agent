from contextlib import contextmanager

from fastapi import HTTPException, Response, status

from ...core.crypto import SecretBoxError
from ...schemas.connector import (
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
from ...services.connectors.errors import ConnectorConflict, ConnectorInvalid, ConnectorNotFound, ConnectorUnavailable
from ...services.connectors.service import ConnectorService


@contextmanager
def connector_errors():
    """Map service errors to HTTP responses."""
    try:
        yield
    except ConnectorNotFound as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(error))
    except ConnectorConflict as error:
        raise HTTPException(status.HTTP_409_CONFLICT, str(error))
    except ConnectorInvalid as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(error))
    except ConnectorUnavailable as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Could not reach the data source: {error}")
    except SecretBoxError as error:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(error))


def list_types(service: ConnectorService) -> list[ConnectorTypeOut]:
    return service.types()


def list_connectors(service: ConnectorService) -> list[ConnectorOut]:
    with connector_errors():
        return service.list_all()


def get_connector(service: ConnectorService, connector_id: int) -> ConnectorOut:
    with connector_errors():
        return service.get(connector_id)


def create_connector(service: ConnectorService, data: ConnectorCreate, response: Response) -> ConnectorOut:
    with connector_errors():
        created = service.create(data)
    response.status_code = status.HTTP_201_CREATED
    return created


def update_connector(service: ConnectorService, connector_id: int, data: ConnectorUpdate) -> ConnectorOut:
    with connector_errors():
        return service.update(connector_id, data)


def delete_connector(service: ConnectorService, connector_id: int) -> Response:
    with connector_errors():
        service.delete(connector_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def test_connector(service: ConnectorService, request: ConnectorTestRequest) -> ConnectorTestResult:
    with connector_errors():
        return service.test(request)


def check_connector(service: ConnectorService, connector_id: int) -> ConnectorTestResult:
    with connector_errors():
        return service.check(connector_id)


def list_catalog(service: ConnectorService, request: CatalogRequest) -> CatalogList:
    with connector_errors():
        return service.list_catalog(request)


def describe_catalog_object(service: ConnectorService, request: CatalogRequest) -> CatalogDetail:
    with connector_errors():
        return service.describe_catalog_object(request)
