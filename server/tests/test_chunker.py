import pytest

from app.services.chunker import PageText, chunk_pages


def test_chunk_pages_preserves_page_and_overlap():
    words = [f"word{i}" for i in range(25)]
    chunks = chunk_pages([PageText(3, " ".join(words))], size_words=10, overlap_words=2)

    assert len(chunks) == 3
    assert all(chunk.page_number == 3 for chunk in chunks)
    assert chunks[0].content.split()[-2:] == chunks[1].content.split()[:2]
    assert [chunk.chunk_index for chunk in chunks] == [0, 1, 2]


def test_chunk_pages_detects_heading_and_skips_empty_pages():
    pages = [
        PageText(1, "ANNUAL LEAVE\nEmployees receive leave according to policy."),
        PageText(2, "  \n"),
    ]
    chunks = chunk_pages(pages, size_words=20, overlap_words=2)

    assert len(chunks) == 1
    assert chunks[0].section == "ANNUAL LEAVE"


def test_invalid_chunk_configuration_is_rejected():
    with pytest.raises(ValueError):
        chunk_pages([PageText(1, "text")], size_words=10, overlap_words=10)

