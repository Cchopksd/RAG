import pytest
from fastapi import HTTPException

from app.api.routes import conversation_title, get_workspace_id


def test_conversation_title_normalizes_and_truncates_question():
    question = "  What   are the most important policies in this handbook?  " + ("More " * 20)

    title = conversation_title(question)

    assert len(title) == 78
    assert title.endswith("…")
    assert "  " not in title


def test_workspace_id_rejects_untrusted_header_value():
    with pytest.raises(HTTPException, match="Invalid X-Workspace-ID header"):
        get_workspace_id("another/workspace")

