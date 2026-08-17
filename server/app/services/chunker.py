import re
from dataclasses import dataclass


@dataclass(frozen=True)
class PageText:
    page_number: int
    text: str


@dataclass(frozen=True)
class Chunk:
    content: str
    page_number: int
    section: str | None
    chunk_index: int
    token_estimate: int


HEADING_PATTERN = re.compile(r"^(?:\d+(?:\.\d+)*[.)]?\s+)?[A-Z][A-Za-z0-9 &,/'()\-]{2,80}$")


def _clean_text(text: str) -> str:
    text = text.replace("\u00ad", "").replace("\u00a0", " ")
    text = re.sub(r"(?<=\w)-\n(?=\w)", "", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _detect_section(lines: list[str], previous: str | None) -> str | None:
    for line in lines[:8]:
        candidate = line.strip().rstrip(":")
        if HEADING_PATTERN.fullmatch(candidate) and len(candidate.split()) <= 10:
            return candidate
    return previous


def chunk_pages(
    pages: list[PageText],
    size_words: int = 180,
    overlap_words: int = 35,
) -> list[Chunk]:
    if size_words <= 0 or overlap_words < 0 or overlap_words >= size_words:
        raise ValueError("Chunk size must be positive and overlap must be smaller than size")

    chunks: list[Chunk] = []
    chunk_index = 0
    current_section: str | None = None
    step = size_words - overlap_words

    for page in pages:
        cleaned = _clean_text(page.text)
        if not cleaned:
            continue
        lines = cleaned.splitlines()
        current_section = _detect_section(lines, current_section)
        words = cleaned.split()

        for start in range(0, len(words), step):
            window = words[start : start + size_words]
            if not window:
                break
            content = " ".join(window)
            chunks.append(
                Chunk(
                    content=content,
                    page_number=page.page_number,
                    section=current_section,
                    chunk_index=chunk_index,
                    token_estimate=max(1, round(len(content) / 4)),
                )
            )
            chunk_index += 1
            if start + size_words >= len(words):
                break

    return chunks

