import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models import ChatRole, Classification


class DocumentOut(BaseModel):
    id: uuid.UUID
    title: str
    filename: str
    classification: Classification
    page_count: int
    chunk_count: int
    document_metadata: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class SearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=2_000)
    top_k: int = Field(default=5, ge=1, le=20)
    document_ids: list[uuid.UUID] | None = None


class SourceOut(BaseModel):
    source_number: int
    document_id: uuid.UUID
    document_title: str
    filename: str
    page_number: int
    section: str | None
    content: str
    score: float


class SearchResponse(BaseModel):
    query: str
    sources: list[SourceOut]


class ChatRequest(SearchRequest):
    question: str | None = Field(default=None, min_length=2, max_length=2_000)
    conversation_id: uuid.UUID | None = None


class ConversationSummaryOut(BaseModel):
    id: uuid.UUID
    title: str
    message_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConversationMessageOut(BaseModel):
    id: uuid.UUID
    role: ChatRole
    content: str
    sources: list[SourceOut]
    grounded: bool | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationOut(ConversationSummaryOut):
    messages: list[ConversationMessageOut]


class ChatResponse(BaseModel):
    answer: str
    grounded: bool
    sources: list[SourceOut]
    conversation: ConversationSummaryOut
    user_message: ConversationMessageOut
    assistant_message: ConversationMessageOut


class HealthResponse(BaseModel):
    status: str
    database: str
    gemini_configured: bool
