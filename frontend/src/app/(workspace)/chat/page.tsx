import type { Metadata } from "next";

import {
  getAccessLevelAction,
  getConversationAction,
  getConversationsAction,
  getDocumentsAction,
} from "@/actions/rag";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: "Ask Atlas — Atlas",
  description: "Ask grounded questions and inspect page-level citations.",
};

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedConversation = typeof params.conversation === "string"
    ? params.conversation
    : null;
  const [access, documentsResult, conversationsResult, requestedResult] = await Promise.all([
    getAccessLevelAction(),
    getDocumentsAction(),
    getConversationsAction(),
    requestedConversation ? getConversationAction(requestedConversation) : Promise.resolve(null),
  ]);
  const selectedId = requestedConversation
    ?? (conversationsResult.ok ? conversationsResult.data[0]?.id : null);
  const conversationResult = requestedResult
    ?? (selectedId ? await getConversationAction(selectedId) : null);
  const conversation = conversationResult?.ok ? conversationResult.data : null;
  const loadErrors = Array.from(new Set([
    documentsResult.ok ? null : documentsResult.error,
    conversationsResult.ok ? null : conversationsResult.error,
    conversationResult && !conversationResult.ok ? conversationResult.error : null,
  ].filter((error): error is string => Boolean(error))));

  return (
    <div className="grid gap-6">
      <header className="flex items-end justify-between gap-4 pt-1">
        <div>
          <span className="text-xs font-semibold tracking-widest text-muted-foreground">GROUNDED Q&amp;A</span>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Ask your knowledge base</h2>
          <p className="mt-1 text-sm text-muted-foreground">Every answer is generated from retrieved evidence and linked back to its source page.</p>
        </div>
      </header>
      {loadErrors.map((error) => (
        <Alert key={error} variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
      ))}
      <ChatWorkspace
        key={conversation?.id ?? "new-conversation"}
        documents={documentsResult.ok ? documentsResult.data : []}
        access={access}
        conversations={conversationsResult.ok ? conversationsResult.data : []}
        conversation={conversation}
      />
    </div>
  );
}
