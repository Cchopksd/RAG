import json
import logging
import re
import shutil
import tempfile
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from app.config import Settings, get_settings
from app.database import SessionLocal, get_db
from app.models import ChatConversation, ChatRole, Classification, ConversationMessage, Document
from app.schemas import (
    ChatRequest,
    ChatResponse,
    ConversationOut,
    ConversationSummaryOut,
    DocumentOut,
    HealthResponse,
    SearchRequest,
    SearchResponse,
    SourceOut,
)
from app.services.gemini import GeminiNotConfigured, GeminiRateLimited, GeminiService
from app.services.ingestion import DuplicateDocumentError, ingest_pdf
from app.services.pdf_parser import PdfParseError
from app.services.retrieval import build_context, hybrid_search


router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

WORKSPACE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$")


def get_gemini(settings: Settings = Depends(get_settings)) -> GeminiService:
    return GeminiService(settings)


def get_access_level(x_access_level: str = Header(default="public")) -> Classification:
    try:
        return Classification(x_access_level.lower())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid X-Access-Level header") from exc


def get_workspace_id(x_workspace_id: str = Header(default="local")) -> str:
    if not WORKSPACE_ID_PATTERN.fullmatch(x_workspace_id):
        raise HTTPException(status_code=400, detail="Invalid X-Workspace-ID header")
    return x_workspace_id


def allowed_classifications(access: Classification) -> list[Classification]:
    allowed = [Classification.public]
    if access in (Classification.internal, Classification.confidential):
        allowed.append(Classification.internal)
    if access == Classification.confidential:
        allowed.append(Classification.confidential)
    return allowed


def visible_document(session: Session, document_id: uuid.UUID, access: Classification) -> Document:
    document = session.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.classification.in_(allowed_classifications(access)),
        )
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


def visible_conversation(
    session: Session,
    conversation_id: uuid.UUID,
    workspace_id: str,
    access: Classification,
    *,
    include_messages: bool = False,
) -> ChatConversation:
    query = select(ChatConversation).where(
        ChatConversation.id == conversation_id,
        ChatConversation.workspace_id == workspace_id,
        ChatConversation.access_level == access,
    )
    if include_messages:
        query = query.options(selectinload(ChatConversation.messages))
    conversation = session.scalar(query)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


def conversation_title(question: str) -> str:
    normalized = " ".join(question.split())
    return normalized if len(normalized) <= 80 else f"{normalized[:77].rstrip()}…"


def conversation_history(conversation: ChatConversation | None, max_messages: int = 12) -> str:
    if not conversation:
        return ""
    return "\n\n".join(
        f"{message.role.value.capitalize()}: {message.content}"
        for message in conversation.messages[-max_messages:]
    )


def sse_event(event: str, payload: dict) -> str:
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event}\ndata: {data}\n\n"


def persist_chat_response(
    *,
    request: ChatRequest,
    question: str,
    answer: str,
    grounded: bool,
    sources: list[SourceOut],
    workspace_id: str,
    access: Classification,
) -> ChatResponse:
    with SessionLocal() as session:
        conversation = (
            visible_conversation(session, request.conversation_id, workspace_id, access)
            if request.conversation_id
            else ChatConversation(
                workspace_id=workspace_id,
                access_level=access,
                title="New chat",
                message_count=0,
            )
        )
        if conversation.message_count == 0:
            conversation.title = conversation_title(question)
        now = datetime.now(UTC)
        user_message = ConversationMessage(
            role=ChatRole.user,
            content=question,
            sources=[],
            grounded=None,
            created_at=now,
        )
        assistant_message = ConversationMessage(
            role=ChatRole.assistant,
            content=answer,
            sources=[source.model_dump(mode="json") for source in sources],
            grounded=grounded,
            created_at=now + timedelta(microseconds=1),
        )
        conversation.messages.extend((user_message, assistant_message))
        conversation.message_count += 2
        conversation.updated_at = now
        session.add(conversation)
        session.commit()
        session.refresh(conversation)
        session.refresh(user_message)
        session.refresh(assistant_message)
        return ChatResponse(
            answer=answer,
            grounded=grounded,
            sources=sources,
            conversation=conversation,
            user_message=user_message,
            assistant_message=assistant_message,
        )


def stream_chat_events(
    *,
    request: ChatRequest,
    question: str,
    sources: list[SourceOut],
    gemini: GeminiService,
    history: str,
    workspace_id: str,
    access: Classification,
) -> Iterator[str]:
    answer_parts: list[str] = []
    try:
        chunks = gemini.answer_stream(question, build_context(sources), history)
        for text_chunk in chunks:
            answer_parts.append(text_chunk)
            yield sse_event("delta", {"text": text_chunk})

        answer = "".join(answer_parts).strip()
        if not answer:
            raise RuntimeError("Gemini returned an empty answer")
        grounded = bool(sources)
        response = persist_chat_response(
            request=request,
            question=question,
            answer=answer,
            grounded=grounded,
            sources=sources,
            workspace_id=workspace_id,
            access=access,
        )
        yield sse_event("done", response.model_dump(mode="json"))
    except GeminiNotConfigured as exc:
        yield sse_event("error", {"message": str(exc), "status": 503})
    except GeminiRateLimited as exc:
        yield sse_event("error", {"message": str(exc), "status": 429})
    except Exception:
        logger.exception("Chat stream failed")
        yield sse_event(
            "error",
            {"message": "The knowledge service could not complete the answer.", "status": 500},
        )


@router.get("/health", response_model=HealthResponse)
def health(
    session: Session = Depends(get_db), settings: Settings = Depends(get_settings)
) -> HealthResponse:
    try:
        session.execute(text("SELECT 1"))
        database_status = "ok"
    except SQLAlchemyError:
        database_status = "unavailable"
    return HealthResponse(
        status="ok" if database_status == "ok" else "degraded",
        database=database_status,
        gemini_configured=bool(settings.gemini_api_key),
    )


@router.get("/documents", response_model=list[DocumentOut])
def list_documents(
    session: Session = Depends(get_db),
    access: Classification = Depends(get_access_level),
) -> list[Document]:
    return list(
        session.scalars(
            select(Document)
            .where(Document.classification.in_(allowed_classifications(access)))
            .order_by(Document.created_at.desc())
        )
    )


@router.get("/conversations", response_model=list[ConversationSummaryOut])
def list_conversations(
    session: Session = Depends(get_db),
    access: Classification = Depends(get_access_level),
    workspace_id: str = Depends(get_workspace_id),
) -> list[ChatConversation]:
    return list(
        session.scalars(
            select(ChatConversation)
            .where(
                ChatConversation.workspace_id == workspace_id,
                ChatConversation.access_level == access,
            )
            .order_by(ChatConversation.updated_at.desc())
            .limit(100)
        )
    )


@router.post(
    "/conversations",
    response_model=ConversationSummaryOut,
    status_code=status.HTTP_201_CREATED,
)
def create_conversation(
    session: Session = Depends(get_db),
    access: Classification = Depends(get_access_level),
    workspace_id: str = Depends(get_workspace_id),
) -> ChatConversation:
    conversation = ChatConversation(
        workspace_id=workspace_id,
        access_level=access,
        title="New chat",
        message_count=0,
    )
    session.add(conversation)
    session.commit()
    session.refresh(conversation)
    return conversation


@router.get("/conversations/{conversation_id}", response_model=ConversationOut)
def get_conversation(
    conversation_id: uuid.UUID,
    session: Session = Depends(get_db),
    access: Classification = Depends(get_access_level),
    workspace_id: str = Depends(get_workspace_id),
) -> ChatConversation:
    return visible_conversation(
        session,
        conversation_id,
        workspace_id,
        access,
        include_messages=True,
    )


@router.get("/documents/{document_id}/file")
def download_document(
    document_id: uuid.UUID,
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    access: Classification = Depends(get_access_level),
) -> FileResponse:
    document = visible_document(session, document_id, access)
    path = Path(settings.upload_dir) / f"{document.id}.pdf"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Original document file not found")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=document.filename,
        content_disposition_type="inline",
    )


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: uuid.UUID,
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    access: Classification = Depends(get_access_level),
) -> None:
    if access != Classification.confidential:
        raise HTTPException(status_code=403, detail="Confidential access is required to delete sources")
    document = visible_document(session, document_id, access)
    stored_file = Path(settings.upload_dir) / f"{document.id}.pdf"
    session.delete(document)
    session.commit()
    stored_file.unlink(missing_ok=True)


@router.post("/documents", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def upload_document(
    file: UploadFile = File(...),
    title: str = Form(default=""),
    classification: Classification = Form(default=Classification.public),
    metadata_json: str = Form(default="{}"),
    session: Session = Depends(get_db),
    gemini: GeminiService = Depends(get_gemini),
    settings: Settings = Depends(get_settings),
) -> Document:
    filename = Path(file.filename or "document.pdf").name
    extension = Path(filename).suffix.lower()
    if extension not in settings.allowed_extensions:
        raise HTTPException(status_code=415, detail="Only PDF files are supported")
    try:
        metadata = json.loads(metadata_json)
        if not isinstance(metadata, dict):
            raise ValueError
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="metadata_json must be a JSON object") from exc

    max_bytes = settings.max_upload_mb * 1024 * 1024
    too_large = False
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as temporary:
        temp_path = Path(temporary.name)
        copied = 0
        while block := file.file.read(1024 * 1024):
            copied += len(block)
            if copied > max_bytes:
                too_large = True
                break
            temporary.write(block)
    if too_large:
        temp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=413, detail="Uploaded file is too large")
    try:
        document = ingest_pdf(
            session=session,
            gemini=gemini,
            settings=settings,
            path=temp_path,
            original_filename=filename,
            title=title,
            classification=classification,
            metadata=metadata,
        )
        destination = Path(settings.upload_dir) / f"{document.id}.pdf"
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(temp_path, destination)
        return document
    except GeminiNotConfigured as exc:
        session.rollback()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except GeminiRateLimited as exc:
        session.rollback()
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except DuplicateDocumentError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail={"message": str(exc), "document_id": str(exc.document_id)},
        ) from exc
    except PdfParseError as exc:
        session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        temp_path.unlink(missing_ok=True)


@router.post("/search", response_model=SearchResponse)
def search_documents(
    request: SearchRequest,
    session: Session = Depends(get_db),
    gemini: GeminiService = Depends(get_gemini),
    access: Classification = Depends(get_access_level),
) -> SearchResponse:
    try:
        result = hybrid_search(
            session, gemini, request.query, request.top_k, access, request.document_ids
        )
    except GeminiNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except GeminiRateLimited as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    return SearchResponse(query=request.query, sources=result.sources)


@router.post("/chat")
def chat(
    request: ChatRequest,
    session: Session = Depends(get_db),
    gemini: GeminiService = Depends(get_gemini),
    access: Classification = Depends(get_access_level),
    workspace_id: str = Depends(get_workspace_id),
) -> StreamingResponse:
    question = request.question or request.query
    conversation = (
        visible_conversation(
            session,
            request.conversation_id,
            workspace_id,
            access,
            include_messages=True,
        )
        if request.conversation_id
        else None
    )
    history = conversation_history(conversation)
    try:
        result = hybrid_search(
            session, gemini, question, request.top_k, access, request.document_ids
        )
        if result.sources:
            _ = gemini.client
    except GeminiNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except GeminiRateLimited as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    session.rollback()
    return StreamingResponse(
        stream_chat_events(
            request=request,
            question=question,
            sources=result.sources,
            gemini=gemini,
            history=history,
            workspace_id=workspace_id,
            access=access,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
