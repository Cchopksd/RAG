import "server-only";

import type {
  AccessLevel,
  ChatMessage,
  Conversation,
  ConversationSummary,
  DocumentRecord,
  Health,
  Source,
} from "./types";

const API_BASE_URL = process.env.RAG_API_URL ?? "http://localhost:8000";
const CHAT_RETRIEVAL_DEPTH = 10;
const WORKSPACE_ID = process.env.ATLAS_WORKSPACE_ID ?? "local";

type JsonRecord = Record<string, unknown>;

export class RagApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "RagApiError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseErrorMessage(payload: unknown): string {
  if (!isRecord(payload)) return "The knowledge service could not complete the request.";
  const detail = payload.detail;
  if (isString(detail)) return detail;
  if (isRecord(detail) && isString(detail.message)) return detail.message;
  return "The knowledge service could not complete the request.";
}

function parseHealth(value: unknown): Health {
  if (
    !isRecord(value)
    || (value.status !== "ok" && value.status !== "degraded")
    || !isString(value.database)
    || typeof value.gemini_configured !== "boolean"
  ) {
    throw new RagApiError("The health response was invalid.", 502);
  }
  return {
    status: value.status,
    database: value.database,
    gemini_configured: value.gemini_configured,
  };
}

function parseDocument(value: unknown): DocumentRecord {
  if (
    !isRecord(value)
    || !isString(value.id)
    || !isString(value.title)
    || !isString(value.filename)
    || (value.classification !== "public" && value.classification !== "internal" && value.classification !== "confidential")
    || !isNumber(value.page_count)
    || !isNumber(value.chunk_count)
    || !isRecord(value.document_metadata)
    || !isString(value.created_at)
  ) {
    throw new RagApiError("A document response was invalid.", 502);
  }
  return {
    id: value.id,
    title: value.title,
    filename: value.filename,
    classification: value.classification,
    page_count: value.page_count,
    chunk_count: value.chunk_count,
    document_metadata: value.document_metadata,
    created_at: value.created_at,
  };
}

function parseSource(value: unknown): Source {
  if (
    !isRecord(value)
    || !isNumber(value.source_number)
    || !isString(value.document_id)
    || !isString(value.document_title)
    || !isString(value.filename)
    || !isNumber(value.page_number)
    || !(value.section === null || isString(value.section))
    || !isString(value.content)
    || !isNumber(value.score)
  ) {
    throw new RagApiError("A citation response was invalid.", 502);
  }
  return {
    source_number: value.source_number,
    document_id: value.document_id,
    document_title: value.document_title,
    filename: value.filename,
    page_number: value.page_number,
    section: value.section,
    content: value.content,
    score: value.score,
  };
}

function parseConversationSummary(value: unknown): ConversationSummary {
  if (
    !isRecord(value)
    || !isString(value.id)
    || !isString(value.title)
    || !isNumber(value.message_count)
    || !isString(value.created_at)
    || !isString(value.updated_at)
  ) {
    throw new RagApiError("A conversation response was invalid.", 502);
  }
  return {
    id: value.id,
    title: value.title,
    message_count: value.message_count,
    created_at: value.created_at,
    updated_at: value.updated_at,
  };
}

function parseConversationMessage(value: unknown): ChatMessage {
  if (
    !isRecord(value)
    || !isString(value.id)
    || (value.role !== "user" && value.role !== "assistant")
    || !isString(value.content)
    || !Array.isArray(value.sources)
    || !(value.grounded === null || typeof value.grounded === "boolean")
    || !isString(value.created_at)
  ) {
    throw new RagApiError("A conversation message response was invalid.", 502);
  }
  return {
    id: value.id,
    role: value.role,
    content: value.content,
    sources: value.sources.map(parseSource),
    grounded: value.grounded,
    created_at: value.created_at,
  };
}

function parseConversation(value: unknown): Conversation {
  if (!isRecord(value) || !Array.isArray(value.messages)) {
    throw new RagApiError("A conversation response was invalid.", 502);
  }
  return {
    ...parseConversationSummary(value),
    messages: value.messages.map(parseConversationMessage),
  };
}

async function request(
  path: string,
  access: AccessLevel,
  options: RequestInit = {},
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        "X-Access-Level": access,
        "X-Workspace-ID": WORKSPACE_ID,
        ...options.headers,
      },
    });
  } catch {
    throw new RagApiError("The knowledge service is offline.", 503);
  }

  if (response.status === 204) return null;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new RagApiError(parseErrorMessage(payload), response.status);
  return payload;
}

export async function fetchHealth(access: AccessLevel): Promise<Health> {
  return parseHealth(await request("/health", access));
}

export async function fetchDocuments(access: AccessLevel): Promise<DocumentRecord[]> {
  const payload = await request("/documents", access);
  if (!Array.isArray(payload)) throw new RagApiError("The document list response was invalid.", 502);
  return payload.map(parseDocument);
}

export async function fetchConversations(access: AccessLevel): Promise<ConversationSummary[]> {
  const payload = await request("/conversations", access);
  if (!Array.isArray(payload)) throw new RagApiError("The conversation list response was invalid.", 502);
  return payload.map(parseConversationSummary);
}

export async function fetchConversation(access: AccessLevel, id: string): Promise<Conversation> {
  return parseConversation(await request(`/conversations/${encodeURIComponent(id)}`, access));
}

export async function createConversation(access: AccessLevel): Promise<ConversationSummary> {
  return parseConversationSummary(await request("/conversations", access, { method: "POST" }));
}

export async function streamQuestion(
  access: AccessLevel,
  question: string,
  documentIds: string[],
  conversationId: string | null,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Level": access,
        "X-Workspace-ID": WORKSPACE_ID,
      },
      body: JSON.stringify({
        query: question,
        question,
        top_k: CHAT_RETRIEVAL_DEPTH,
        document_ids: documentIds.length ? documentIds : null,
        conversation_id: conversationId,
      }),
    });
  } catch {
    throw new RagApiError("The knowledge service is offline.", 503);
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw new RagApiError(parseErrorMessage(payload), response.status);
  }
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
    throw new RagApiError("The knowledge service returned an invalid chat stream.", 502);
  }
  return response;
}

export async function uploadDocument(
  access: AccessLevel,
  body: FormData,
): Promise<DocumentRecord> {
  return parseDocument(await request("/documents", access, { method: "POST", body }));
}

export async function deleteDocument(access: AccessLevel, id: string): Promise<void> {
  await request(`/documents/${encodeURIComponent(id)}`, access, { method: "DELETE" });
}
