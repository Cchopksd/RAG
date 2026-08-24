import json
import uuid
from types import SimpleNamespace

from app.api import routes
from app.models import Classification
from app.schemas import ChatRequest, SourceOut


class FakeGemini:
    def answer_stream(self, question: str, context: str, history: str):
        assert question == "What is the policy?"
        assert "Policy handbook" in context
        assert history == "User: Earlier question\n\nAssistant: Earlier answer [1]."
        yield "The policy "
        yield "is documented [1]."


def event_payload(event: str) -> dict:
    data_line = next(line for line in event.splitlines() if line.startswith("data: "))
    return json.loads(data_line.removeprefix("data: "))


def test_chat_stream_emits_deltas_then_persisted_completion(monkeypatch):
    source = SourceOut(
        source_number=1,
        document_id=uuid.uuid4(),
        document_title="Policy handbook",
        filename="policy.pdf",
        page_number=3,
        section="Leave",
        content="The policy is documented.",
        score=0.5,
    )
    persisted = {}

    def fake_persist(**kwargs):
        persisted.update(kwargs)
        return SimpleNamespace(
            model_dump=lambda **_: {
                "answer": kwargs["answer"],
                "grounded": kwargs["grounded"],
            }
        )

    monkeypatch.setattr(routes, "persist_chat_response", fake_persist)

    events = list(
        routes.stream_chat_events(
            request=ChatRequest(query="What is the policy?"),
            question="What is the policy?",
            sources=[source],
            gemini=FakeGemini(),
            history="User: Earlier question\n\nAssistant: Earlier answer [1].",
            workspace_id="local",
            access=Classification.public,
        )
    )

    assert [event.splitlines()[0] for event in events] == [
        "event: delta",
        "event: delta",
        "event: done",
    ]
    assert event_payload(events[0]) == {"text": "The policy "}
    assert event_payload(events[1]) == {"text": "is documented [1]."}
    assert event_payload(events[2]) == {
        "answer": "The policy is documented [1].",
        "grounded": True,
    }
    assert persisted["answer"] == "The policy is documented [1]."
