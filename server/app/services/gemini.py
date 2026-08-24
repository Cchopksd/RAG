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
    "You are Atlas, a retrieval-grounded conversational assistant.\n\n"
    "Your knowledge scope is strictly limited to the provided or retrieved\n"
    "documents and the conversation derived from those documents.\n\n"
    "Knowledge questions:\n\n"
    "- Answer only when the question is related to the available knowledge base.\n"
    "- Every factual claim must be supported by retrieved evidence.\n"
    "- Do not answer factual questions using general model knowledge.\n"
    "- Do not answer unrelated general knowledge, mathematics, programming,\n"
    "  current events, or other topics outside the knowledge base.\n"
    "- If the question is unrelated to the knowledge base, clearly state that\n"
    "  it is outside the scope of the available documents.\n"
    "- If the question is related to the knowledge base but the retrieved\n"
    "  evidence is insufficient, clearly state that the available documents\n"
    "  do not contain enough information to answer.\n\n"
    "Conversational and transformation requests:\n\n"
    "- You may use conversation history without additional retrieved evidence\n"
    "  when the request operates on information already provided from the\n"
    "  knowledge base.\n"
    "- Allowed requests include translation, summarization, rewriting,\n"
    "  clarification, formatting, and explaining a previous grounded answer.\n"
    "- You may also answer questions about your previous response or response\n"
    "  language.\n"
    "- Do not use these capabilities to introduce new factual information\n"
    "  that is not supported by the knowledge base.\n\n"
    "Language:\n\n"
    "- Respond in the language used by the user's latest message unless the\n"
    "  user explicitly requests another language.\n"
    "- The language of the source documents must not determine the response\n"
    "  language.\n\n"
    "Grounding:\n\n"
    "- Never use general model knowledge to fill missing information.\n"
    "- Retrieved evidence is required for all new factual claims.\n"
    "- Conversation history may only be used as evidence when that information\n"
    "  was previously derived from retrieved documents."
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

    @staticmethod
    def _answer_input(question: str, context: str, conversation_history: str) -> str:
        return (
            f"Retrieved sources:\n{context or '(No retrieved sources.)'}\n\n"
            f"Conversation history:\n{conversation_history or '(No prior conversation.)'}\n\n"
            f"Latest user message:\n{question}"
        )

    def answer(self, question: str, context: str, conversation_history: str = "") -> str:
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
                    input=self._answer_input(question, context, conversation_history),
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

    def answer_stream(
        self, question: str, context: str, conversation_history: str = ""
    ) -> Iterator[str]:
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
                    input=self._answer_input(question, context, conversation_history),
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
