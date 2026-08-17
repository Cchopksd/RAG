"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { ACCESS_COOKIE, getCurrentAccessLevel, isAccessLevel } from "@/lib/access.server";
import {
  createConversation,
  deleteDocument,
  fetchConversation,
  fetchConversations,
  fetchDocuments,
  fetchHealth,
  RagApiError,
  uploadDocument,
} from "@/lib/rag-api.server";
import type { AccessLevel, Conversation, ConversationSummary, DocumentRecord, Health } from "@/lib/types";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function actionError(error: unknown): string {
  if (error instanceof RagApiError) {
    if (error.status === 429) return "Gemini is busy right now. Please wait a moment and try again.";
    if (error.status === 503) return error.message;
    if (error.status === 403) return "Your current access scope does not allow this action.";
    if (error.status === 404) return "The requested source could not be found.";
    return error.message;
  }
  return "Something went wrong while contacting the knowledge service.";
}

function revalidateKnowledgeRoutes() {
  revalidatePath("/overview");
  revalidatePath("/chat");
  revalidatePath("/sources");
}

export async function getAccessLevelAction(): Promise<AccessLevel> {
  return getCurrentAccessLevel();
}

export async function setAccessLevelAction(value: string): Promise<ActionResult<AccessLevel>> {
  if (!isAccessLevel(value)) return { ok: false, error: "Choose a valid access scope." };
  (await cookies()).set(ACCESS_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidateKnowledgeRoutes();
  return { ok: true, data: value };
}

export async function getHealthAction(): Promise<ActionResult<Health>> {
  try {
    return { ok: true, data: await fetchHealth(await getCurrentAccessLevel()) };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}

export async function getDocumentsAction(): Promise<ActionResult<DocumentRecord[]>> {
  try {
    return { ok: true, data: await fetchDocuments(await getCurrentAccessLevel()) };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}

export async function getConversationsAction(): Promise<ActionResult<ConversationSummary[]>> {
  try {
    return { ok: true, data: await fetchConversations(await getCurrentAccessLevel()) };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}

export async function getConversationAction(id: string): Promise<ActionResult<Conversation>> {
  if (!UUID_PATTERN.test(id)) return { ok: false, error: "The conversation identifier is invalid." };
  try {
    return { ok: true, data: await fetchConversation(await getCurrentAccessLevel(), id) };
  } catch (error) {
    if (error instanceof RagApiError && error.status === 404) {
      return { ok: false, error: "That conversation is no longer available in this access scope." };
    }
    return { ok: false, error: actionError(error) };
  }
}

export async function createConversationAction(): Promise<ActionResult<ConversationSummary>> {
  try {
    const conversation = await createConversation(await getCurrentAccessLevel());
    revalidatePath("/chat");
    return { ok: true, data: conversation };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}

export async function uploadDocumentAction(body: FormData): Promise<ActionResult<DocumentRecord>> {
  const file = body.get("file");
  const title = body.get("title");
  const classification = body.get("classification");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Select a PDF to continue." };
  if (file.size > 25 * 1024 * 1024) return { ok: false, error: "The PDF must be smaller than 25 MB." };
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return { ok: false, error: "Choose a PDF document." };
  }
  if (typeof title !== "string" || !title.trim() || title.trim().length > 300) {
    return { ok: false, error: "Enter a document title up to 300 characters." };
  }
  if (typeof classification !== "string" || !isAccessLevel(classification)) {
    return { ok: false, error: "Choose a valid document classification." };
  }
  try {
    const access = await getCurrentAccessLevel();
    const allowedClassifications: Record<AccessLevel, AccessLevel[]> = {
      public: ["public"],
      internal: ["public", "internal"],
      confidential: ["public", "internal", "confidential"],
    };
    if (!allowedClassifications[access].includes(classification)) {
      return { ok: false, error: "Your current access scope cannot assign that classification." };
    }
    const document = await uploadDocument(access, body);
    revalidateKnowledgeRoutes();
    return { ok: true, data: document };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}

export async function deleteDocumentAction(id: string): Promise<ActionResult<null>> {
  if (!UUID_PATTERN.test(id)) return { ok: false, error: "The source identifier is invalid." };
  try {
    await deleteDocument(await getCurrentAccessLevel(), id);
    revalidateKnowledgeRoutes();
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}
