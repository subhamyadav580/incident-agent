from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

NAME_PATTERN = r"^[a-z][a-z0-9_]{0,49}$"


class ConnectorCreate(BaseModel):
    name: str = Field(pattern=NAME_PATTERN, description="Lowercase id the agent uses, e.g. orders")
    type: str
    enabled: bool = True
    settings: dict[str, Any] = Field(default_factory=dict)
    secrets: dict[str, Optional[str]] = Field(default_factory=dict)


class ConnectorUpdate(BaseModel):
    name: Optional[str] = Field(default=None, pattern=NAME_PATTERN)
    enabled: Optional[bool] = None
    settings: Optional[dict[str, Any]] = None
    # "" or missing keeps the stored value, null removes it.
    secrets: dict[str, Optional[str]] = Field(default_factory=dict)


class ConnectorOut(BaseModel):
    id: int
    name: str
    type: str
    enabled: bool
    settings: dict[str, Any]
    secrets_set: list[str] = Field(description="Secret fields that have a stored value (values are never returned)")
    created_at: datetime
    updated_at: datetime


class ConnectorTestRequest(BaseModel):
    """Test unsaved settings; `id` reuses stored secrets for fields left blank."""

    type: str
    id: Optional[int] = None
    settings: dict[str, Any] = Field(default_factory=dict)
    secrets: dict[str, Optional[str]] = Field(default_factory=dict)


class ConnectorTestResult(BaseModel):
    ok: bool
    message: str
    latency_ms: Optional[int] = None


class FieldSpec(BaseModel):
    name: str
    label: str
    kind: Literal["text", "number", "bool", "select", "textarea", "password", "catalog"]
    required: bool = False
    default: Any = None
    options: Optional[list[str]] = None
    help: str = ""
    secret: bool = False
    group: Literal["main", "advanced"] = "main"
    # Only shown (and only meaningful) when another field has one of these values,
    # e.g. {"source": ["remote"]}.
    show_if: Optional[dict[str, list[str]]] = None


class ConnectorTypeOut(BaseModel):
    type: str
    label: str
    description: str
    catalog_label: str = Field(description="What the catalog lists, e.g. Tables or Index groups")
    fields: list[FieldSpec]


class CatalogRequest(BaseModel):
    """Browse a data source with (possibly unsaved) settings; `id` reuses stored secrets."""

    type: str
    id: Optional[int] = None
    settings: dict[str, Any] = Field(default_factory=dict)
    secrets: dict[str, Optional[str]] = Field(default_factory=dict)
    object: Optional[str] = Field(default=None, description="Table or index group to describe")


class CatalogObject(BaseModel):
    name: str
    detail: str = ""
    comment: str = ""


class CatalogColumn(BaseModel):
    name: str
    type: str
    indexed: bool = False
    comment: str = ""


class CatalogList(BaseModel):
    objects: list[CatalogObject]
    truncated: bool = False


class CatalogDetail(BaseModel):
    name: str
    columns: list[CatalogColumn]
