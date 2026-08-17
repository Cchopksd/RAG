from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Gemini Knowledge RAG"
    database_url: str = "postgresql+psycopg://rag:rag@localhost:5432/rag"
    gemini_api_key: str = ""
    gemini_generation_model: str = "gemini-3.6-flash"
    gemini_fallback_generation_model: str = "gemini-3.5-flash-lite"
    gemini_embedding_model: str = "gemini-embedding-2"
    embedding_dimensions: int = 768
    max_upload_mb: int = 25
    chunk_size_words: int = 180
    chunk_overlap_words: int = 35
    default_top_k: int = 5
    upload_dir: str = "data/uploads"
    allowed_extensions: set[str] = Field(default_factory=lambda: {".pdf"})

    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_chunking(self) -> "Settings":
        if self.chunk_overlap_words >= self.chunk_size_words:
            raise ValueError("CHUNK_OVERLAP_WORDS must be smaller than CHUNK_SIZE_WORDS")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
