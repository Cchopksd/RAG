from pathlib import Path

import fitz
import pytest

from app.services.pdf_parser import PdfParseError, parse_pdf


def test_parse_pdf_returns_page_metadata(tmp_path: Path):
    path = tmp_path / "policy.pdf"
    document = fitz.open()
    page = document.new_page()
    page.insert_text((72, 72), "Annual leave policy")
    document.save(path)
    document.close()

    pages = parse_pdf(path)

    assert pages[0].page_number == 1
    assert "Annual leave policy" in pages[0].text


def test_parse_pdf_rejects_image_only_document(tmp_path: Path):
    path = tmp_path / "scan.pdf"
    document = fitz.open()
    document.new_page()
    document.save(path)
    document.close()

    with pytest.raises(PdfParseError, match="No extractable text"):
        parse_pdf(path)

