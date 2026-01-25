from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://scrum_user:scrum_pass@db:5432/scrum_calendar"
    app_env: str = "development"


settings = Settings()
