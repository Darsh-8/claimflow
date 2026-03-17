from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./claimflow.db"
    UPLOAD_DIR: str = "./uploads"
    KIMI_API_KEY: str = ""
    KIMI_API_URL: str = "https://api.novita.ai/v3/openai/chat/completions"
    KIMI_MODEL_NAME: str = "moonshotai/Kimi-K2.5"
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "us-west-2"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Ensure upload directory exists
Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
