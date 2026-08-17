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

  return (
    <div className="view-stack">
      <header className="page-intro">
        <div>
          <span className="overline">GROUNDED Q&amp;A</span>
          <h2>Ask your knowledge base</h2>
          <p>Every answer is generated from retrieved evidence and linked back to its source page.</p>
        </div>
      </header>
      {!documentsResult.ok && <Alert variant="destructive"><AlertDescription>{documentsResult.error}</AlertDescription></Alert>}
      {!conversationsResult.ok && <Alert variant="destructive"><AlertDescription>{conversationsResult.error}</AlertDescription></Alert>}
      {conversationResult && !conversationResult.ok && (
        <Alert variant="destructive"><AlertDescription>{conversationResult.error}</AlertDescription></Alert>
      )}
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
