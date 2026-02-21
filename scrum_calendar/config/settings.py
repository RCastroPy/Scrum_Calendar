import json

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Keep non-sensitive default in code; real credentials must come from env.
    database_url: str = "postgresql+psycopg2://localhost:5432/scrum_calendar"
    app_env: str = "development"
    cors_origins_raw: str = "http://localhost:8000"
    cors_allow_credentials: bool = False
    pbkdf2_rounds: int = 600_000
    session_cookie_secure: bool = False
    disable_docs_in_production: bool = True
    login_rate_limit_enabled: bool = True
    login_rate_limit_max_attempts: int = 8
    login_rate_limit_window_seconds: int = 900
    login_rate_limit_block_seconds: int = 900
    security_audit_log_enabled: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins(self) -> list[str]:
        raw = (self.cors_origins_raw or "").strip()
        if not raw:
            return ["http://localhost:8000"]
        if raw.startswith("["):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    values = [str(item).strip() for item in parsed if str(item).strip()]
                    return values or ["http://localhost:8000"]
            except json.JSONDecodeError:
                pass
        values = [item.strip() for item in raw.split(",") if item.strip()]
        return values or ["http://localhost:8000"]

    @property
    def docs_enabled(self) -> bool:
        is_production = self.app_env.strip().lower() == "production"
        return not (is_production and self.disable_docs_in_production)

    @property
    def cookie_secure(self) -> bool:
        is_production = self.app_env.strip().lower() == "production"
        return bool(self.session_cookie_secure or is_production)


settings = Settings()
