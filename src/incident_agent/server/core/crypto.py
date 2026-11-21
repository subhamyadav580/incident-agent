import json
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from .config import get_settings


class SecretBoxError(RuntimeError):
    pass


class SecretBox:
    """Encrypts connector credentials before they are stored."""

    def __init__(self, key: str):
        if not key:
            raise SecretBoxError(
                "APP_SECRET_KEY is not set. Generate one with "
                "`incident-agent-server --generate-key` and add it to .env."
            )
        self._fernet = Fernet(key.encode())

    def encrypt(self, values: dict) -> str:
        return self._fernet.encrypt(json.dumps(values).encode()).decode()

    def decrypt(self, token: str) -> dict:
        if not token:
            return {}
        try:
            return json.loads(self._fernet.decrypt(token.encode()))
        except InvalidToken as error:
            raise SecretBoxError("Stored credentials cannot be decrypted: APP_SECRET_KEY changed?") from error


def generate_key() -> str:
    return Fernet.generate_key().decode()


@lru_cache
def get_secret_box() -> SecretBox:
    return SecretBox(get_settings().secret_key)
