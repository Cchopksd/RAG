import { getCurrentAccessLevel } from "@/lib/access.server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const access = await getCurrentAccessLevel();
  const apiBaseUrl = process.env.RAG_API_URL ?? "http://localhost:8000";
  const upstream = await fetch(`${apiBaseUrl}/api/documents/${encodeURIComponent(id)}/file`, {
    headers: { "X-Access-Level": access },
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("Source document is unavailable.", { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/pdf",
      "Content-Disposition": upstream.headers.get("Content-Disposition") ?? "inline",
      "Cache-Control": "private, no-store",
    },
  });
}
