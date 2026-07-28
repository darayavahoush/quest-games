from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/breathquest"

    # Must exactly match BreathQuest's SECRET_KEY/ALGORITHM — VaakMirror
    # never issues its own tokens, it only verifies ones BreathQuest issued.
    # Copy the same SECRET_KEY value into both .env files.
    secret_key: str = "change-this-in-production-use-openssl-rand-hex-32"
    algorithm: str = "HS256"

    # Comma-separated in .env, split into a list here.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    model_config = SettingsConfigDict(env_file=".env", env_prefix="", case_sensitive=False)


settings = Settings()
