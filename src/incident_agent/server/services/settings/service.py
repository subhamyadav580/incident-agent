from incident_agent.app import AgentConfig, default_system_prompt

from ...core.crypto import SecretBox
from ...repos.settings_repo import SettingsRepo
from ...schemas.settings import AgentSettings, SettingsOut, SettingsUpdate


class SettingsService:
    def __init__(self, repo: SettingsRepo, secret_box: SecretBox):
        self.repo = repo
        self.secret_box = secret_box

    def _current(self) -> tuple[AgentSettings, dict]:
        row = self.repo.get_or_create()
        # Stored values over defaults, so new settings get their default automatically.
        return AgentSettings(**row.settings), self.secret_box.decrypt(row.secrets)

    def get(self) -> SettingsOut:
        settings, secrets = self._current()
        return SettingsOut(
            **settings.model_dump(),
            model_api_key_set=bool(secrets.get("model_api_key")),
            default_prompt=default_system_prompt(),
        )

    def update(self, data: SettingsUpdate) -> SettingsOut:
        row = self.repo.get_or_create()
        secrets = self.secret_box.decrypt(row.secrets)
        if data.model_api_key is None:
            secrets.pop("model_api_key", None)
        elif data.model_api_key != "":
            secrets["model_api_key"] = data.model_api_key

        settings = AgentSettings(**data.model_dump(exclude={"model_api_key"}))
        if settings.router_model_name == "":
            settings.router_model_name = None
        row.settings = settings.model_dump()
        row.secrets = self.secret_box.encrypt(secrets)
        self.repo.save(row)
        return self.get()

    def agent_config(self) -> AgentConfig:
        settings, secrets = self._current()
        return AgentConfig(
            model_name=settings.model_name,
            model_provider=settings.model_provider or None,
            model_api_key=secrets.get("model_api_key") or None,
            router_enabled=settings.router_enabled,
            router_model_name=settings.router_model_name or None,
            max_steps=settings.max_steps,
            extra_instructions=settings.extra_instructions,
        )
