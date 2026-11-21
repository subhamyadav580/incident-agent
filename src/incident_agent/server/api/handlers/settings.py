from fastapi import HTTPException, status

from ...core.crypto import SecretBoxError
from ...schemas.settings import SettingsOut, SettingsUpdate
from ...services.settings.service import SettingsService


def get_settings(service: SettingsService) -> SettingsOut:
    try:
        return service.get()
    except SecretBoxError as error:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(error))


def update_settings(service: SettingsService, data: SettingsUpdate) -> SettingsOut:
    try:
        return service.update(data)
    except SecretBoxError as error:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(error))
