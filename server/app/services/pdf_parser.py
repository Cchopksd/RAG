from pathlib import Path

import fitz

from app.services.chunker import PageText


class PdfParseError(ValueError):
    pass


def parse_pdf(path: Path) -> list[PageText]:
    try:
        document = fitz.open(path)
    except Exception as exc:
        raise PdfParseError("The uploaded file is not a readable PDF") from exc

    try:
        if document.is_encrypted and not document.authenticate(""):
            raise PdfParseError("Password-protected PDFs are not supported")
        pages = [
            PageText(page_number=index + 1, text=page.get_text("text", sort=True))
            for index, page in enumerate(document)
        ]
    finally:
        document.close()

    if not any(page.text.strip() for page in pages):
        raise PdfParseError("No extractable text was found; scanned PDFs need OCR first")
    return pages

