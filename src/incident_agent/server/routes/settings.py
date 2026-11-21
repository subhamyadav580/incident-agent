from fastapi import APIRouter, Depends

from ..api.handlers import settings as handlers
from ..dependencies import get_settings_service
from ..schemas.settings import SettingsOut, SettingsUpdate
from ..services.settings.service import SettingsService

router = APIRouter(prefix="/api", tags=["settings"])


@router.get("/settings", response_model=SettingsOut)
def get_settings(service: SettingsService = Depends(get_settings_service)):
    return handlers.get_settings(service)


@router.put("/settings", response_model=SettingsOut)
def update_settings(data: SettingsUpdate, service: SettingsService = Depends(get_settings_service)):
    return handlers.update_settings(service, data)
