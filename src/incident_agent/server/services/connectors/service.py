import logging
import time
from ...core.crypto import SecretBox
from ...models import Connector
from ...repos.connector_repo import ConnectorRepo
from ...schemas.connector import (
    CatalogColumn,
    CatalogDetail,
    CatalogList,
    CatalogObject,
    CatalogRequest,
    ConnectorCreate,
    ConnectorOut,
    ConnectorTestRequest,
    ConnectorTestResult,
    ConnectorTypeOut,
    ConnectorUpdate,
)
from .errors import ConnectorConflict, ConnectorInvalid, ConnectorNotFound, ConnectorUnavailable
from .registry import CONNECTOR_TYPES, get_connector_type

logger = logging.getLogger(__name__)


def _merge_secrets(stored: dict, incoming: dict) -> dict:
    """"" or missing keeps the stored value, None removes it, anything else replaces it."""
    merged = dict(stored)
    for key, value in incoming.items():
        if value is None:
            merged.pop(key, None)
        elif value != "":
            merged[key] = value
    return merged


class ConnectorService:
    def __init__(self, repo: ConnectorRepo, secret_box: SecretBox):
        self.repo = repo
        self.secret_box = secret_box

    # -- reads ----------------------------------------------------------------

    def types(self) -> list[ConnectorTypeOut]:
        return [
            ConnectorTypeOut(
                type=kind.type, label=kind.label, description=kind.description,
                catalog_label=kind.catalog_label, fields=kind.fields,
            )
            for kind in CONNECTOR_TYPES.values()
        ]

    def list_all(self) -> list[ConnectorOut]:
        return [self._out(connector) for connector in self.repo.list_all()]

    def get(self, connector_id: int) -> ConnectorOut:
        return self._out(self._get(connector_id))

    # -- writes ---------------------------------------------------------------

    def create(self, data: ConnectorCreate) -> ConnectorOut:
        kind = get_connector_type(data.type)
        if self.repo.get_by_name(data.name):
            raise ConnectorConflict(f"A connector named {data.name!r} already exists")

        secrets = _merge_secrets({}, data.secrets)
        connector = Connector(
            name=data.name,
            type=kind.type,
            enabled=data.enabled,
            settings=kind.normalize(data.settings, secrets),
            secrets=self.secret_box.encrypt(secrets),
        )
        self._check_enabled_combination(connector)
        return self._out(self.repo.add(connector))

    def update(self, connector_id: int, data: ConnectorUpdate) -> ConnectorOut:
        connector = self._get(connector_id)
        kind = get_connector_type(connector.type)

        if data.name and data.name != connector.name:
            if self.repo.get_by_name(data.name):
                raise ConnectorConflict(f"A connector named {data.name!r} already exists")
            connector.name = data.name

        secrets = _merge_secrets(self.secret_box.decrypt(connector.secrets), data.secrets)
        if data.settings is not None:
            connector.settings = kind.normalize(data.settings, secrets)
        connector.secrets = self.secret_box.encrypt(secrets)
        if data.enabled is not None:
            connector.enabled = data.enabled

        self._check_enabled_combination(connector)
        return self._out(self.repo.save(connector))

    def delete(self, connector_id: int) -> None:
        self.repo.delete(self._get(connector_id))

    # -- connection test ------------------------------------------------------

    def test(self, request: ConnectorTestRequest) -> ConnectorTestResult:
        kind = get_connector_type(request.type)
        stored = {}
        if request.id is not None:
            stored = self.secret_box.decrypt(self._get(request.id).secrets)
        secrets = _merge_secrets(stored, request.secrets)
        started = time.monotonic()
        try:
            settings = kind.normalize(request.settings, secrets)
            message = kind.test(settings, secrets)
            return ConnectorTestResult(ok=True, message=message, latency_ms=int((time.monotonic() - started) * 1000))
        except ConnectorInvalid:
            raise
        except Exception as error:  # connection errors come in many types per driver
            logger.info("Connector test failed: %s", error)
            return ConnectorTestResult(ok=False, message=str(error).strip().splitlines()[0][:500])

    # -- catalog (tables / index groups) ---------------------------------------

    def _catalog_context(self, request: CatalogRequest):
        kind = get_connector_type(request.type)
        stored = self.secret_box.decrypt(self._get(request.id).secrets) if request.id is not None else {}
        secrets = _merge_secrets(stored, request.secrets)
        return kind, kind.normalize(request.settings, secrets), secrets

    def list_catalog(self, request: CatalogRequest) -> CatalogList:
        kind, settings, secrets = self._catalog_context(request)
        try:
            objects, truncated = kind.list_objects(settings, secrets)
        except ConnectorInvalid:
            raise
        except Exception as error:
            raise ConnectorUnavailable(str(error).strip().splitlines()[0][:500])
        return CatalogList(objects=[CatalogObject(**item) for item in objects], truncated=truncated)

    def describe_catalog_object(self, request: CatalogRequest) -> CatalogDetail:
        if not request.object:
            raise ConnectorInvalid("object is required")
        kind, settings, secrets = self._catalog_context(request)
        try:
            columns = kind.describe_object(settings, secrets, request.object)
        except ConnectorInvalid:
            raise
        except Exception as error:
            raise ConnectorUnavailable(str(error).strip().splitlines()[0][:500])
        return CatalogDetail(name=request.object, columns=[CatalogColumn(**column) for column in columns])

    def check(self, connector_id: int) -> ConnectorTestResult:
        """Health check of a stored connector with its stored settings and secrets."""
        connector = self._get(connector_id)
        return self.test(ConnectorTestRequest(type=connector.type, id=connector.id, settings=connector.settings))

    # -- agent wiring ---------------------------------------------------------

    def plugins_config(self) -> dict:
        """Plugin options for build_agent(), built from the enabled connectors."""
        plugins: dict[str, dict] = {}
        for connector in self.repo.list_enabled():
            kind = get_connector_type(connector.type)
            options = plugins.setdefault(kind.plugin, {"enabled": True})
            kind.add_to_plugin(options, connector.name, connector.settings, self.secret_box.decrypt(connector.secrets))
        return plugins

    # -- helpers --------------------------------------------------------------

    def _get(self, connector_id: int) -> Connector:
        connector = self.repo.get(connector_id)
        if connector is None:
            raise ConnectorNotFound(f"Connector {connector_id} not found")
        return connector

    def _check_enabled_combination(self, candidate: Connector) -> None:
        """Reject a set of enabled connectors that cannot be turned into plugins."""
        enabled = [c for c in self.repo.list_enabled() if c.id != candidate.id]
        if candidate.enabled:
            enabled.append(candidate)
        options: dict[str, dict] = {}
        for connector in enabled:
            kind = get_connector_type(connector.type)
            kind.add_to_plugin(options.setdefault(kind.plugin, {}), connector.name, connector.settings, {})

    def _out(self, connector: Connector) -> ConnectorOut:
        return ConnectorOut(
            id=connector.id,
            name=connector.name,
            type=connector.type,
            enabled=connector.enabled,
            settings=connector.settings,
            secrets_set=sorted(key for key, value in self.secret_box.decrypt(connector.secrets).items() if value),
            created_at=connector.created_at,
            updated_at=connector.updated_at,
        )
