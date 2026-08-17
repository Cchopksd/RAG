import uuid
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import Classification
from app.schemas import SourceOut
from app.services.gemini import GeminiService


ACCESS_LEVEL = {
    Classification.public: 0,
    Classification.internal: 1,
    Classification.confidential: 2,
}


@dataclass(frozen=True)
class RetrievalResult:
    sources: list[SourceOut]


HYBRID_SEARCH_SQL = text(
    """
    WITH eligible AS (
        SELECT c.id, c.document_id, c.content, c.page_number, c.section,
               c.embedding, d.title, d.filename
        FROM document_chunks c
        JOIN documents d ON d.id = c.document_id
        WHERE CASE d.classification::text
                WHEN 'public' THEN 0
                WHEN 'internal' THEN 1
                WHEN 'confidential' THEN 2
              END <= :access_level
          AND (:filter_documents = FALSE OR c.document_id = ANY(CAST(:document_ids AS uuid[])))
    ),
    vector_ranked AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> CAST(:embedding AS vector)) AS rank
        FROM eligible
        ORDER BY embedding <=> CAST(:embedding AS vector)
        LIMIT 40
    ),
    keyword_ranked AS (
        SELECT id, ROW_NUMBER() OVER (
            ORDER BY ts_rank_cd(to_tsvector('english', content), websearch_to_tsquery('english', :query)) DESC
        ) AS rank
        FROM eligible
        WHERE to_tsvector('english', content) @@ websearch_to_tsquery('english', :query)
        ORDER BY ts_rank_cd(to_tsvector('english', content), websearch_to_tsquery('english', :query)) DESC
        LIMIT 40
    ),
    candidates AS (
        SELECT id FROM vector_ranked
        UNION
        SELECT id FROM keyword_ranked
    )
    SELECT e.document_id, e.title, e.filename, e.content, e.page_number, e.section,
           COALESCE(1.0 / (60 + vr.rank), 0) + COALESCE(1.0 / (60 + kr.rank), 0) AS score
    FROM candidates candidate
    JOIN eligible e ON e.id = candidate.id
    LEFT JOIN vector_ranked vr ON vr.id = candidate.id
    LEFT JOIN keyword_ranked kr ON kr.id = candidate.id
    ORDER BY score DESC
    LIMIT :top_k
    """
)


def hybrid_search(
    session: Session,
    gemini: GeminiService,
    query: str,
    top_k: int,
    access: Classification,
    document_ids: list[uuid.UUID] | None = None,
) -> RetrievalResult:
    query_embedding = gemini.embed_query(query)
    vector_literal = "[" + ",".join(f"{value:.10f}" for value in query_embedding) + "]"
    rows = session.execute(
        HYBRID_SEARCH_SQL,
        {
            "query": query,
            "embedding": vector_literal,
            "top_k": top_k,
            "access_level": ACCESS_LEVEL[access],
            "filter_documents": bool(document_ids),
            "document_ids": [str(value) for value in (document_ids or [])],
        },
    ).mappings()
    sources = [
        SourceOut(
            source_number=index,
            document_id=row["document_id"],
            document_title=row["title"],
            filename=row["filename"],
            page_number=row["page_number"],
            section=row["section"],
            content=row["content"],
            score=float(row["score"]),
        )
        for index, row in enumerate(rows, start=1)
    ]
    return RetrievalResult(sources=sources)


def build_context(sources: list[SourceOut]) -> str:
    return "\n\n".join(
        (
            f"[{source.source_number}] Document: {source.document_title}; "
            f"Page: {source.page_number}; Section: {source.section or 'Unknown'}\n"
            f"{source.content}"
        )
        for source in sources
    )

