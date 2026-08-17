import uuid

from app.schemas import SourceOut
from app.services.retrieval import build_context


def test_build_context_uses_stable_source_markers():
    source = SourceOut(
        source_number=1,
        document_id=uuid.uuid4(),
        document_title="Staff Handbook",
        filename="handbook.pdf",
        page_number=18,
        section="Annual Leave",
        content="Employees receive 15 days.",
        score=0.03,
    )

    context = build_context([source])

    assert context.startswith("[1] Document: Staff Handbook; Page: 18")
    assert "Employees receive 15 days." in context

