from typing import List, Union
from pydantic_settings import BaseSettings
from pydantic import Field, field_validator

class Settings(BaseSettings):
    PROJECT_NAME: str = "MetaRouter AI Gateway"
    DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours
    META_API_VERSION: str = "v20.0"

    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAILS_FROM_EMAIL: str = "opticoasis0@gmail.com"
    FRONTEND_BASE_URL: str = "http://localhost:5173"
    
    # Super Admin Bootstrap Settings
    SUPER_ADMIN_NAME: str
    SUPER_ADMIN_EMAIL: str
    SUPER_ADMIN_PASSWORD: str

    # CORS settings - handle both string or list gracefully
    CORS_ORIGINS: Union[str, List[str]] = "http://localhost:5173,http://localhost"

    @field_validator("CORS_ORIGINS", mode="before")
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()