from typing import Optional

from pydantic import BaseModel, Field


class AgentSettings(BaseModel):
    model_provider: str = Field(default="openai", description="openai, anthropic, google_genai, ollama, ...")
    model_name: str = Field(default="gpt-4.1-mini", min_length=1)
    router_enabled: bool = True
    router_model_name: Optional[str] = Field(default=None, description="Cheaper model for intent routing; empty = main model")
    max_steps: int = Field(default=8, ge=1, le=50)
    extra_instructions: str = Field(default="", description="Appended to the built-in prompt")


class SettingsUpdate(AgentSettings):
    # "" or missing keeps the stored key, null removes it.
    model_api_key: Optional[str] = ""


class SettingsOut(AgentSettings):
    model_api_key_set: bool
    default_prompt: str
