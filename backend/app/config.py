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
    META_GRAPH_API_URL: str = "https://graph.facebook.com"
    WHATSAPP_REQUEST_TIMEOUT_SECONDS: int = 15
    # Meta app secret: verifies the X-Hub-Signature-256 header on incoming webhooks
    META_APP_SECRET: str = ""
    # Any random string; must match "Verify token" in the Meta app's WhatsApp webhook settings
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: str = ""
    # Fernet key used to encrypt stored WhatsApp access tokens
    TOKEN_ENCRYPTION_KEY: str = ""

    # Customer media (bills, documents, images) downloaded from WhatsApp
    MEDIA_STORAGE_PATH: str = "/data/media"
    MEDIA_MAX_DOWNLOAD_BYTES: int = 26214400  # 25 MB
    MEDIA_MAX_PARSE_BYTES: int = 15728640  # 15 MB (Gemini inline request limit is 20 MB)
    GEMINI_PARSER_MODEL: str = "gemini-3.8-flash"

    # Broadcasts
    BROADCAST_MESSAGES_PER_SECOND: int = 20  # Spread sends below Meta's per-number throughput
    BROADCAST_RECENT_MESSAGE_DAYS: int = 7  # Skip customers we messaged within this many days
    BROADCAST_MAX_RECIPIENTS: int = 10000
    BROADCAST_MAX_CSV_BYTES: int = 2097152  # 2 MB
    BROADCAST_DEFAULT_NAME: str = "Customer"  # Used for {{1}} when a contact has no name
    OPT_OUT_KEYWORDS: str = "STOP,UNSUBSCRIBE"
    OPT_IN_KEYWORDS: str = "START"

    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAILS_FROM_EMAIL: str = "opticoasis0@gmail.com"
    FRONTEND_BASE_URL: str = "http://localhost:5173"

    GOOGLE_API_KEY: str = ""
    GEMINI_CHAT_MODEL: str = "gemini-3.8-flash"
    GEMINI_EMBEDDING_MODEL: str = "gemini-embedding-001"
    # Must match the Vector(...) size of knowledge_chunks.embedding
    EMBEDDING_DIMENSIONS: int = 768
    
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