import hashlib
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Classification, Document, DocumentChunk
from app.services.chunker import chunk_pages
from app.services.gemini import GeminiService
from app.services.pdf_parser import parse_pdf


class DuplicateDocumentError(ValueError):
    def __init__(self, document_id: uuid.UUID):
        self.document_id = document_id
        super().__init__("This document has already been indexed")


def file_checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def ingest_pdf(
    session: Session,
    gemini: GeminiService,
    settings: Settings,
    path: Path,
    original_filename: str,
    title: str,
    classification: Classification,
    metadata: dict,
) -> Document:
    checksum = file_checksum(path)
    existing = session.scalar(select(Document).where(Document.checksum == checksum))
    if existing:
        raise DuplicateDocumentError(existing.id)

    pages = parse_pdf(path)
    chunks = chunk_pages(
        pages,
        size_words=settings.chunk_size_words,
        overlap_words=settings.chunk_overlap_words,
    )
    embeddings = gemini.embed_documents([chunk.content for chunk in chunks])

    document = Document(
        title=title.strip() or Path(original_filename).stem,
        filename=original_filename,
        content_type="application/pdf",
        checksum=checksum,
        classification=classification,
        page_count=len(pages),
        chunk_count=len(chunks),
        document_metadata=metadata,
    )
    session.add(document)
    session.flush()
    session.add_all(
        [
            DocumentChunk(
                document_id=document.id,
                content=chunk.content,
                page_number=chunk.page_number,
                section=chunk.section,
                chunk_index=chunk.chunk_index,
                token_estimate=chunk.token_estimate,
                embedding=embedding,
                chunk_metadata={},
            )
            for chunk, embedding in zip(chunks, embeddings, strict=True)
        ]
    )
    session.commit()
    session.refresh(document)
    return document

