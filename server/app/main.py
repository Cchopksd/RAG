from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import router
from app.config import get_settings
from app.database import initialize_database


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


settings = get_settings()
app = FastAPI(
    title=settings.app_name,
    description="Citation-first internal knowledge assistant powered by Gemini and pgvector.",
    version="0.1.0",
    lifespan=lifespan,
)
app.include_router(router)
