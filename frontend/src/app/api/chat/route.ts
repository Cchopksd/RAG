import { NextResponse } from "next/server";

import { getCurrentAccessLevel } from "@/lib/access.server";
import { RagApiError, streamQuestion } from "@/lib/rag-api.server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorResponse(error: unknown) {
  if (error instanceof RagApiError) {
    if (error.status === 429) {
      return NextResponse.json(
        { error: "Gemini is busy right now. Please wait a moment and try again." },
        { status: 429 },
      );
    }
    if (error.status === 403) {
      return NextResponse.json(
        { error: "Your current access scope does not allow this action." },
        { status: 403 },
      );
    }
    const status = error.status >= 400 && error.status < 600 ? error.status : 502;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(
    { error: "Something went wrong while contacting the knowledge service." },
    { status: 502 },
  );
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "The chat request was invalid." }, { status: 400 });
  }

  if (!isRecord(payload)) {
    return NextResponse.json({ error: "The chat request was invalid." }, { status: 400 });
  }

  const question = typeof payload.question === "string" ? payload.question.trim() : "";
  const documentIds = payload.documentIds;
  const conversationId = payload.conversationId ?? null;
  if (question.length < 2 || question.length > 2_000) {
    return NextResponse.json(
      { error: "Enter a question between 2 and 2,000 characters." },
      { status: 400 },
    );
  }
  if (
    !Array.isArray(documentIds)
    || documentIds.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))
  ) {
    return NextResponse.json({ error: "The selected source filter is invalid." }, { status: 400 });
  }
  if (!(conversationId === null || (typeof conversationId === "string" && UUID_PATTERN.test(conversationId)))) {
    return NextResponse.json({ error: "The conversation identifier is invalid." }, { status: 400 });
  }

  try {
    const upstream = await streamQuestion(
      await getCurrentAccessLevel(),
      question,
      documentIds,
      conversationId,
    );
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
