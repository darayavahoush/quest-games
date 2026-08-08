from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/breathquest"

    # JWT
    SECRET_KEY: str = "change-this-in-production-use-openssl-rand-hex-32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours for therapists

    # Kid session tokens (simpler, longer-lived)
    KID_TOKEN_EXPIRE_DAYS: int = 30

    # Email (OTP verification) — Gmail SMTP with an app password. See
    # routers/verify.py / core/email.py. Not required at startup: if unset,
    # /verify/request will fail loudly with a clear error rather than the
    # app refusing to boot, same tolerance-for-missing-optional-config
    # pattern as ASSESSMENT_SERVICE_API_KEY elsewhere in this codebase.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""

    # App
    APP_NAME: str = "BreathQuest"
    DEBUG: bool = False
    ALLOWED_ORIGINS: list[str] = (
    [f"http://localhost:{p}" for p in range(5173, 5180)]
    + [
        "http://localhost:3000",
        "https://quest-games.onrender.com",
    ]
)

    class Config:
        env_file = ".env"
        extra = "ignore"  # ASSESSMENT_SERVICE_URL/API_KEY etc. are read
        # directly via os.getenv() in core/assessment_client.py, not
        # through this typed Settings model — don't fail startup on them.


@lru_cache
def get_settings() -> Settings:
    return Settings()
