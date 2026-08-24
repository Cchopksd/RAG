from types import SimpleNamespace

import pytest
from google.genai import errors
from google.genai import types

from app.config import Settings
from app.services.gemini import ANSWER_SYSTEM_INSTRUCTION, GeminiRateLimited, GeminiService


class FakeModels:
    def embed_content(self, **kwargs):
        contents = kwargs["contents"]
        self.last_contents = contents
        count = len(contents) if isinstance(contents, list) else 1
        return SimpleNamespace(
            embeddings=[SimpleNamespace(values=[0.1, 0.2, 0.3]) for _ in range(count)]
        )



class FakeInteractions:
    def __init__(self):
        self.last_request = None

    def create(self, **kwargs):
        self.last_request = kwargs
        if kwargs.get("stream"):
            return iter(
                (
                    SimpleNamespace(
                        event_type="step.delta",
                        delta=SimpleNamespace(type="text", text="Employees receive "),
                    ),
                    SimpleNamespace(
                        event_type="step.delta",
                        delta=SimpleNamespace(type="text", text="15 days [1]."),
                    ),
                )
            )
        return SimpleNamespace(output_text="Employees receive 15 days [1].")


def service_with_fake_client() -> GeminiService:
    service = GeminiService(Settings(gemini_api_key="test", embedding_dimensions=3))
    service._client = SimpleNamespace(models=FakeModels(), interactions=FakeInteractions())
    return service


def test_document_embedding_count_matches_inputs():
    service = service_with_fake_client()
    vectors = service.embed_documents(["one", "two"])
    assert vectors == [[0.1, 0.2, 0.3], [0.1, 0.2, 0.3]]
    assert all(
        isinstance(content, types.Content)
        for content in service._client.models.last_contents
    )


def test_embedding_retries_after_rate_limit(monkeypatch):
    class RateLimitedOnceModels(FakeModels):
        calls = 0

        def embed_content(self, **kwargs):
            self.calls += 1
            if self.calls == 1:
                raise errors.ClientError(
                    429,
                    {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED"}},
                )
            return super().embed_content(**kwargs)

    delays = []
    monkeypatch.setattr("app.services.gemini.time.sleep", delays.append)
    service = service_with_fake_client()
    models = RateLimitedOnceModels()
    service._client.models = models

    assert service.embed_documents(["one"]) == [[0.1, 0.2, 0.3]]
    assert models.calls == 2
    assert delays == [15.0]


def test_answer_returns_grounded_text():
    service = service_with_fake_client()
    answer = service.answer(
        "แปล",
        "",
        "User: How much leave?\n\nAssistant: Employees receive 15 days [1].",
    )

    assert answer.endswith("[1].")
    assert service._client.interactions.last_request["system_instruction"] == (
        ANSWER_SYSTEM_INSTRUCTION
    )
    assert service._client.interactions.last_request["input"] == (
        "Retrieved sources:\n(No retrieved sources.)\n\n"
        "Conversation history:\nUser: How much leave?\n\n"
        "Assistant: Employees receive 15 days [1].\n\n"
        "Latest user message:\nแปล"
    )


def test_answer_stream_yields_text_deltas():
    service = service_with_fake_client()

    chunks = list(service.answer_stream("How much leave?", "[1] 15 days"))

    assert chunks == ["Employees receive ", "15 days [1]."]


def test_answer_translates_generation_rate_limit(monkeypatch):
    class FakeRateLimitError(Exception):
        pass

    class RateLimitedInteractions:
        def create(self, **kwargs):
            raise FakeRateLimitError

    monkeypatch.setattr("app.services.gemini.RateLimitError", FakeRateLimitError)
    service = service_with_fake_client()
    service._client.interactions = RateLimitedInteractions()

    with pytest.raises(GeminiRateLimited, match="generation rate limit exceeded"):
        service.answer("How much leave?", "[1] 15 days")


def test_answer_uses_fallback_model_after_primary_rate_limit(monkeypatch):
    class FakeRateLimitError(Exception):
        pass

    class FallbackInteractions:
        def __init__(self):
            self.models = []

        def create(self, **kwargs):
            self.models.append(kwargs["model"])
            if len(self.models) == 1:
                raise FakeRateLimitError
            return SimpleNamespace(output_text="Employees receive 10 days [1].")

    monkeypatch.setattr("app.services.gemini.RateLimitError", FakeRateLimitError)
    service = service_with_fake_client()
    interactions = FallbackInteractions()
    service._client.interactions = interactions

    answer = service.answer("How much leave?", "[1] 10 days")

    assert answer == "Employees receive 10 days [1]."
    assert interactions.models == ["gemini-3.6-flash", "gemini-3.5-flash-lite"]


def test_answer_stream_uses_fallback_model_before_emitting_text(monkeypatch):
    class FakeRateLimitError(Exception):
        pass

    class FallbackStreamingInteractions:
        def __init__(self):
            self.models = []

        def create(self, **kwargs):
            self.models.append(kwargs["model"])
            if len(self.models) == 1:
                raise FakeRateLimitError
            return iter(
                (
                    SimpleNamespace(
                        event_type="step.delta",
                        delta=SimpleNamespace(type="text", text="Fallback answer [1]."),
                    ),
                )
            )

    monkeypatch.setattr("app.services.gemini.RateLimitError", FakeRateLimitError)
    service = service_with_fake_client()
    interactions = FallbackStreamingInteractions()
    service._client.interactions = interactions

    answer = "".join(service.answer_stream("How much leave?", "[1] 10 days"))

    assert answer == "Fallback answer [1]."
    assert interactions.models == ["gemini-3.6-flash", "gemini-3.5-flash-lite"]
