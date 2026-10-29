from typing import List, Union
from pydantic_settings import BaseSettings
from pydantic import Field, field_validator

class Settings(BaseSettings):
    PROJECT_NAME: str = "MetaRouter AI Gateway"
    DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30  # Workspace access token; renewed silently with the refresh-token cookie
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    REFRESH_ROTATION_GRACE_SECONDS: int = 30  # A just-rotated refresh token still works this long (parallel tabs / requests refreshing together)
    SUPER_ADMIN_TOKEN_EXPIRE_MINUTES: int = 1440  # Super admin has no refresh token yet, so one longer token
    IMPERSONATION_TOKEN_EXPIRE_MINUTES: int = 30  # Read-only support session in a client workspace; no refresh token, it just ends
    IMPERSONATION_CODE_EXPIRE_SECONDS: int = 60  # One-time code the admin tab hands to the new workspace tab
    COOKIE_SECURE: bool = False  # True in production (HTTPS): the refresh-token cookie is then only sent over HTTPS

    # Login protection: failed attempts allowed per email + IP and per IP, then locked for LOGIN_LOCKOUT_MINUTES
    LOGIN_MAX_ATTEMPTS: int = 5
    LOGIN_MAX_ATTEMPTS_PER_IP: int = 30
    LOGIN_LOCKOUT_MINUTES: int = 15
    META_API_VERSION: str = "v20.0"
    META_GRAPH_API_URL: str = "https://graph.facebook.com"
    WHATSAPP_REQUEST_TIMEOUT_SECONDS: int = 15
    # Meta app secret: verifies the X-Hub-Signature-256 header on incoming webhooks
    META_APP_SECRET: str = ""
    META_APP_ID: str = ""  # Public app id: the browser needs it to open Meta's Embedded Signup popup (served by the backend)
    META_CONFIG_ID: str = ""  # Embedded Signup configuration id (Facebook Login for Business), also public
    # Any random string; must match "Verify token" in the Meta app's WhatsApp webhook settings
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: str = ""
    # Fernet key used to encrypt stored WhatsApp access tokens
    TOKEN_ENCRYPTION_KEY: str = ""

    # Customer media (bills, documents, images) downloaded from WhatsApp
    MEDIA_STORAGE_PATH: str = "/data/media"
    MEDIA_MAX_DOWNLOAD_BYTES: int = 26214400  # 25 MB
    MEDIA_MAX_PARSE_BYTES: int = 15728640  # 15 MB (Gemini inline request limit is 20 MB)
    GEMINI_PARSER_MODEL: str = "gemini-3.8-flash"
    GEMINI_PARSER_BACKUP_MODEL: str = "gemini-flash-latest,gemini-3.6-flash"  # Tried in order when the parser model is overloaded / times out
    GEMINI_AUDIO_MODEL: str = "gemini-3.5-flash"  # Voice note transcription: fast and spells regional languages correctly
    GEMINI_AUDIO_BACKUP_MODEL: str = "gemini-3.6-flash,gemini-flash-lite-latest"  # Tried in order when the audio model is overloaded / times out

    # Knowledge base PDFs (processed in the background, stored on the media_data volume)
    KNOWLEDGE_STORAGE_PATH: str = "/data/media/knowledge"
    KNOWLEDGE_MAX_PDF_BYTES: int = 10485760  # 10 MB
    KNOWLEDGE_CHUNK_SIZE: int = 1000  # Characters per chunk sent for embedding
    KNOWLEDGE_CHUNK_OVERLAP: int = 200  # Characters repeated between chunks so answers aren't cut off
    KNOWLEDGE_MAX_DOCUMENTS: int = 50  # Per organization

    # Broadcasts
    BROADCAST_MESSAGES_PER_SECOND: int = 20  # Spread sends below Meta's per-number throughput
    BROADCAST_DISPATCH_BATCH_SIZE: int = 500  # Messages released per dispatcher run (quality/tier re-checked between runs)
    BROADCAST_RECENT_MESSAGE_DAYS: int = 7  # Skip customers we messaged within this many days
    BROADCAST_MAX_RECIPIENTS: int = 10000
    BROADCAST_MAX_CSV_BYTES: int = 2097152  # 2 MB
    BROADCAST_DEFAULT_NAME: str = "Customer"  # Used for {{1}} when a contact has no name
    OPT_OUT_KEYWORDS: str = "STOP,UNSUBSCRIBE"
    OPT_IN_KEYWORDS: str = "START"

    # Scheduled jobs (Celery Beat)
    NUMBER_REFRESH_INTERVAL_MINUTES: int = 360  # Refresh quality rating + tier from Meta
    MESSAGE_SWEEP_INTERVAL_MINUTES: int = 5  # Re-queue outgoing messages stuck in pending
    STUCK_MESSAGE_MINUTES: int = 10  # A pending message older than this is considered stuck
    STUCK_MEDIA_MAX_AGE_HOURS: int = 24  # Customer media still pending after this is marked failed instead of retried
    BROADCAST_CHECK_INTERVAL_SECONDS: int = 60  # Restart tier-paused broadcasts that are due
    TICKET_IDLE_CLOSE_HOURS: int = 4  # An AI-handled ticket with no new message for this long is closed (no reply)
    TICKET_SWEEP_INTERVAL_MINUTES: int = 10  # How often idle tickets are checked
    UNASSIGNED_REMINDER_MINUTES: str = "5,15"  # Remind about a handed-over chat nobody took after these minutes (first: the team, later: admins / managers)
    UNASSIGNED_REMINDER_CHECK_SECONDS: int = 60  # How often waiting chats are checked
    NOTIFICATION_RETENTION_DAYS: int = 60  # Read notifications older than this are deleted (unread ones are kept)
    NOTIFICATION_CLEANUP_INTERVAL_HOURS: int = 24  # How often old notifications are cleaned up
    STALLED_BROADCAST_MINUTES: int = 10  # Sending broadcast with no progress for this long is restarted

    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAILS_FROM_EMAIL: str = ""
    FRONTEND_BASE_URL: str = "http://localhost:5173"
    INVITES_MAX_PER_ORG_PER_HOUR: int = 100  # Invite emails (new + resent) a workspace can send each hour
    PASSWORD_RESET_EXPIRE_MINUTES: int = 30  # A "forgot password" link works this long, and only once
    PASSWORD_RESET_MAX_PER_EMAIL_PER_HOUR: int = 3  # Reset emails per address each hour (each one is a real email)
    PASSWORD_RESET_MAX_PER_IP_PER_HOUR: int = 10
    WORKSPACE_URL_TEMPLATE: str = "http://localhost:5173"  # Where a workspace opens; "{slug}" is replaced, e.g. https://{slug}.metarouter.ai

    GOOGLE_API_KEY: str = ""
    GEMINI_CHAT_MODEL: str = "gemini-3.8-flash"
    GEMINI_CHAT_BACKUP_MODEL: str = "gemini-3.5-flash-lite,gemini-flash-latest"  # Tried in order when the chat model is overloaded / times out
    GEMINI_TIMEOUT_SECONDS: int = 60  # A Gemini request taking longer is treated as failed (then retried / backup)
    GEMINI_RETRIES: int = 1  # Extra tries on the same model before switching to the backup
    GEMINI_CHAT_TIMEOUT_SECONDS: int = 20  # Customer replies: a model slower than this is skipped for the backup (the customer is waiting)
    GEMINI_EMBEDDING_MODEL: str = "gemini-embedding-001"
    AI_SIMULATOR_MAX_PER_10_MIN: int = 30  # "Try it" test questions per admin every 10 minutes (each one is a Gemini call)
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