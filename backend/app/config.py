from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "MetaRouter AI Gateway"
    DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str
    META_API_VERSION: str = "v20.0"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()