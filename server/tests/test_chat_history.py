import pytest
from fastapi import HTTPException

from types import SimpleNamespace

from app.api.routes import conversation_history, conversation_title, get_workspace_id
from app.models import ChatRole


def test_conversation_title_normalizes_and_truncates_question():
    question = "  What   are the most important policies in this handbook?  " + ("More " * 20)

    title = conversation_title(question)

    assert len(title) == 78
    assert title.endswith("…")
    assert "  " not in title


def test_workspace_id_rejects_untrusted_header_value():
    with pytest.raises(HTTPException, match="Invalid X-Workspace-ID header"):
        get_workspace_id("another/workspace")


def test_conversation_history_keeps_recent_turns_in_role_order():
    messages = [
        SimpleNamespace(role=ChatRole.user, content=f"Question {index}")
        for index in range(13)
    ]
    conversation = SimpleNamespace(messages=messages)

    history = conversation_history(conversation)

    assert "Question 0" not in history
    assert history.startswith("User: Question 1")
    assert history.endswith("User: Question 12")
