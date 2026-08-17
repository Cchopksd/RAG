from collections.abc import Iterator, Sequence
import time

from google import genai
from google.genai import errors
from google.genai import types
from google.genai._gaos.lib.compat_errors import RateLimitError

from app.config import Settings


class GeminiNotConfigured(RuntimeError):
    pass


class GeminiRateLimited(RuntimeError):
    pass


EMBED_RETRY_DELAYS_SECONDS = (15.0, 45.0, 60.0)

ANSWER_SYSTEM_INSTRUCTION = (
    "You are an internal knowledge assistant. Answer only from the supplied evidence. "
    "Cite factual claims with source markers such as [1] or [2]. If the evidence is "
    "insufficient, say exactly: 'I don’t have enough evidence to answer that.' "
    "When a broad question has different answers by tenure, role, or category, summarize "
    "every relevant value in the evidence and explain what each value depends on; do not "
    "decline merely because there is no single value. Format the response as concise "
    "GitHub-flavored Markdown. Start with the direct answer. Use bullet points or numbered "
    "steps for distinct items, and use a Markdown table when comparing three or more records "
    "with the same fields. Keep citations in the relevant sentence, bullet, or table cell. "
    "Do not output HTML. Never invent a policy, page, source, or quotation."
)


class GeminiService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._client: genai.Client | None = None

    @property
    def client(self) -> genai.Client:
        if not self.settings.gemini_api_key:
            raise GeminiNotConfigured("GEMINI_API_KEY is not configured")
        if self._client is None:
            self._client = genai.Client(api_key=self.settings.gemini_api_key)
        return self._client

    def _embed_content_with_retry(self, **kwargs):
        for attempt in range(len(EMBED_RETRY_DELAYS_SECONDS) + 1):
            try:
                return self.client.models.embed_content(**kwargs)
            except errors.ClientError as exc:
                if exc.code != 429:
                    raise
                if attempt == len(EMBED_RETRY_DELAYS_SECONDS):
                    raise GeminiRateLimited(
                        "Gemini embedding rate limit exceeded; try again later"
                    ) from exc
                time.sleep(EMBED_RETRY_DELAYS_SECONDS[attempt])
        raise RuntimeError("Gemini embedding retry loop exited unexpectedly")

    def embed_documents(self, texts: Sequence[str], batch_size: int = 32) -> list[list[float]]:
        vectors: list[list[float]] = []
        for start in range(0, len(texts), batch_size):
            batch = list(texts[start : start + batch_size])
            response = self._embed_content_with_retry(
                model=self.settings.gemini_embedding_model,
                contents=[
                    types.Content(parts=[types.Part(text=text)]) for text in batch
                ],
                config=types.EmbedContentConfig(
                    task_type="RETRIEVAL_DOCUMENT",
                    output_dimensionality=self.settings.embedding_dimensions,
                ),
            )
            vectors.extend([list(item.values or []) for item in response.embeddings or []])
        if len(vectors) != len(texts):
            raise RuntimeError("Gemini returned an unexpected number of document embeddings")
        return vectors

    def embed_query(self, query: str) -> list[float]:
        response = self._embed_content_with_retry(
            model=self.settings.gemini_embedding_model,
            contents=query,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_QUERY",
                output_dimensionality=self.settings.embedding_dimensions,
            ),
        )
        if not response.embeddings or not response.embeddings[0].values:
            raise RuntimeError("Gemini returned no query embedding")
        return list(response.embeddings[0].values)

    def answer(self, question: str, context: str) -> str:
        models = dict.fromkeys(
            model
            for model in (
                self.settings.gemini_generation_model,
                self.settings.gemini_fallback_generation_model,
            )
            if model
        )
        rate_limit_error: RateLimitError | None = None
        interaction = None
        for model in models:
            try:
                interaction = self.client.interactions.create(
                    model=model,
                    input=f"Evidence:\n{context}\n\nQuestion: {question}",
                    system_instruction=ANSWER_SYSTEM_INSTRUCTION,
                    generation_config={"max_output_tokens": 900},
                    store=False,
                )
                break
            except RateLimitError as exc:
                rate_limit_error = exc
        if interaction is None:
            raise GeminiRateLimited(
                "Gemini generation rate limit exceeded for all configured models; "
                "wait a moment and try again"
            ) from rate_limit_error
        answer = (interaction.output_text or "").strip()
        if not answer:
            raise RuntimeError("Gemini returned an empty answer")
        return answer

    def answer_stream(self, question: str, context: str) -> Iterator[str]:
        models = dict.fromkeys(
            model
            for model in (
                self.settings.gemini_generation_model,
                self.settings.gemini_fallback_generation_model,
            )
            if model
        )
        rate_limit_error: RateLimitError | None = None
        for model in models:
            emitted_text = False
            stream = None
            try:
                stream = self.client.interactions.create(
                    model=model,
                    input=f"Evidence:\n{context}\n\nQuestion: {question}",
                    system_instruction=ANSWER_SYSTEM_INSTRUCTION,
                    generation_config={"max_output_tokens": 900},
                    store=False,
                    stream=True,
                )
                for event in stream:
                    if getattr(event, "event_type", None) != "step.delta":
                        continue
                    delta = getattr(event, "delta", None)
                    if getattr(delta, "type", None) != "text":
                        continue
                    text = getattr(delta, "text", "")
                    if text:
                        emitted_text = True
                        yield text
                if emitted_text:
                    return
                raise RuntimeError("Gemini returned an empty answer")
            except RateLimitError as exc:
                rate_limit_error = exc
                if emitted_text:
                    break
            finally:
                close = getattr(stream, "close", None)
                if callable(close):
                    close()
        raise GeminiRateLimited(
            "Gemini generation rate limit exceeded for all configured models; "
            "wait a moment and try again"
        ) from rate_limit_error
