"use client";

import {
  BookOpenText,
  Bot,
  ChevronDown,
  CircleAlert,
  Clipboard,
  ExternalLink,
  FileSearch,
  MessageSquareText,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { createConversationAction } from "@/actions/rag";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ACCESS_LABELS } from "@/components/workspace/workspace-config";
import { sourceUrl } from "@/lib/source-url";
import type {
  AccessLevel,
  ChatMessage,
  ChatResponse,
  Conversation,
  ConversationSummary,
  DocumentRecord,
  Source,
} from "@/lib/types";

const SUGGESTED_QUESTIONS = [
  "What are the most important policies in these documents?",
  "Are staff employees considered at-will employees?",
  "Summarize the rules for computer and email usage.",
  "Who is responsible for updating the staff handbook?",
];

const MARKDOWN_PLUGINS = [remarkGfm];

function MarkdownAnswer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={MARKDOWN_PLUGINS}
      skipHtml
      components={{
        table: ({ children }) => (
          <div className="message-table-wrap">
            <table>{children}</table>
          </div>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function welcomeMessage(): ChatMessage {
  return {
    id: "welcome",
    role: "assistant",
    content: "Hi — I’m Atlas. Ask me anything about your indexed knowledge. I’ll ground every answer in retrieved evidence and show you the source pages.",
    sources: [],
    grounded: null,
    created_at: "",
  };
}

function optimisticUserMessage(content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    content,
    sources: [],
    grounded: null,
    created_at: new Date().toISOString(),
  };
}

function optimisticAssistantMessage(id: string, content: string): ChatMessage {
  return {
    id,
    role: "assistant",
    content,
    sources: [],
    grounded: null,
    created_at: new Date().toISOString(),
  };
}

type ChatRequestResult =
  | { ok: true; data: ChatResponse }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSource(value: unknown): value is Source {
  return isRecord(value)
    && typeof value.source_number === "number"
    && typeof value.document_id === "string"
    && typeof value.document_title === "string"
    && typeof value.filename === "string"
    && typeof value.page_number === "number"
    && (value.section === null || typeof value.section === "string")
    && typeof value.content === "string"
    && typeof value.score === "number";
}

function isConversationSummary(value: unknown): value is ConversationSummary {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.message_count === "number"
    && typeof value.created_at === "string"
    && typeof value.updated_at === "string";
}

function isChatMessage(value: unknown): value is ChatMessage {
  return isRecord(value)
    && typeof value.id === "string"
    && (value.role === "user" || value.role === "assistant")
    && typeof value.content === "string"
    && Array.isArray(value.sources)
    && value.sources.every(isSource)
    && (value.grounded === null || typeof value.grounded === "boolean")
    && typeof value.created_at === "string";
}

function isChatResponse(value: unknown): value is ChatResponse {
  return isRecord(value)
    && typeof value.answer === "string"
    && typeof value.grounded === "boolean"
    && Array.isArray(value.sources)
    && value.sources.every(isSource)
    && isConversationSummary(value.conversation)
    && isChatMessage(value.user_message)
    && isChatMessage(value.assistant_message);
}

async function requestAnswer(
  question: string,
  documentIds: string[],
  conversationId: string | null,
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<ChatRequestResult> {
  let response: Response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, documentIds, conversationId }),
      signal,
    });
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") throw caught;
    return { ok: false, error: "The knowledge service is offline." };
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    return {
      ok: false,
      error: isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : "Atlas could not answer this question.",
    };
  }
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
    return { ok: false, error: "Atlas returned an invalid answer stream." };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed: ChatResponse | null = null;
  let streamError: string | null = null;

  while (!completed && !streamError) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary).replaceAll("\r", "");
      buffer = buffer.slice(boundary + 2);
      const lines = block.split("\n");
      const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() ?? "message";
      const data = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) {
        let payload: unknown;
        try {
          payload = JSON.parse(data);
        } catch {
          streamError = "Atlas returned an invalid answer stream.";
          break;
        }
        if (event === "delta") {
          if (!isRecord(payload) || typeof payload.text !== "string") {
            streamError = "Atlas returned an invalid answer stream.";
            break;
          }
          onDelta(payload.text);
        } else if (event === "done") {
          if (!isChatResponse(payload)) {
            streamError = "The saved answer response was invalid.";
            break;
          }
          completed = payload;
        } else if (event === "error") {
          if (isRecord(payload) && payload.status === 429) {
            streamError = "Gemini is busy right now. Please wait a moment and try again.";
          } else {
            streamError = isRecord(payload) && typeof payload.message === "string"
              ? payload.message
              : "Atlas could not answer this question.";
          }
          break;
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
    if (done) break;
  }

  if (streamError) {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
    return { ok: false, error: streamError };
  }
  reader.releaseLock();
  if (!completed) return { ok: false, error: "The answer stream ended before Atlas finished." };
  return { ok: true, data: completed };
}

export function ChatWorkspace({
  documents,
  access,
  conversations,
  conversation,
}: {
  documents: DocumentRecord[];
  access: AccessLevel;
  conversations: ConversationSummary[];
  conversation: Conversation | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(
    conversation?.messages.length ? conversation.messages : [welcomeMessage()],
  );
  const [history, setHistory] = useState(conversations);
  const [activeConversationId, setActiveConversationId] = useState(conversation?.id ?? null);
  const [question, setQuestion] = useState("");
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    questionRef.current?.focus();
  }, [activeConversationId]);

  useEffect(() => () => requestControllerRef.current?.abort(), []);

  async function startNewChat() {
    if (creating || sending) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createConversationAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setHistory((current) => [result.data, ...current]);
      router.push(`/chat?conversation=${encodeURIComponent(result.data.id)}`);
    } catch {
      setError("Atlas could not create a new conversation.");
    } finally {
      setCreating(false);
    }
  }

  async function submit(event?: FormEvent, suggested?: string) {
    event?.preventDefault();
    const text = (suggested ?? question).trim();
    if (!text || sending) return;
    const optimisticMessage = optimisticUserMessage(text);
    const assistantMessageId = crypto.randomUUID();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    let streamedAnswer = "";
    setQuestion("");
    setError(null);
    setMessages((current) => [
      ...current.filter((message) => message.id !== "welcome"),
      optimisticMessage,
    ]);
    setSending(true);
    setStreaming(false);
    const restoreFailedSubmission = () => {
      setMessages((current) => {
        const restored = current.filter((message) => (
          message.id !== optimisticMessage.id && message.id !== assistantMessageId
        ));
        return restored.length ? restored : [welcomeMessage()];
      });
      setQuestion(text);
    };
    try {
      const result = await requestAnswer(
        text,
        selectedDocuments,
        activeConversationId,
        (textChunk) => {
          streamedAnswer += textChunk;
          setStreaming(true);
          setMessages((current) => {
            const existing = current.some((message) => message.id === assistantMessageId);
            if (!existing) {
              return [...current, optimisticAssistantMessage(assistantMessageId, streamedAnswer)];
            }
            return current.map((message) => message.id === assistantMessageId
              ? { ...message, content: streamedAnswer }
              : message);
          });
        },
        controller.signal,
      );
      if (!result.ok) {
        restoreFailedSubmission();
        setError(result.error);
        return;
      }
      setMessages((current) => [
        ...current.filter((message) => (
          message.id !== optimisticMessage.id && message.id !== assistantMessageId
        )),
        result.data.user_message,
        result.data.assistant_message,
      ]);
      setHistory((current) => [
        result.data.conversation,
        ...current.filter((item) => item.id !== result.data.conversation.id),
      ]);
      if (activeConversationId !== result.data.conversation.id) {
        setActiveConversationId(result.data.conversation.id);
        router.replace(`/chat?conversation=${encodeURIComponent(result.data.conversation.id)}`);
      } else {
        router.refresh();
      }
    } catch (caught) {
      restoreFailedSubmission();
      if (!(caught instanceof DOMException && caught.name === "AbortError")) {
        setError(caught instanceof Error ? caught.message : "Atlas could not answer this question.");
      }
    } finally {
      if (requestControllerRef.current === controller) requestControllerRef.current = null;
      setSending(false);
      setStreaming(false);
      questionRef.current?.focus();
    }
  }

  function toggleDocument(id: string) {
    setSelectedDocuments((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id]);
  }

  return (
    <div className="chat-layout">
      <Card className="chat-context" aria-label="Chat history">
        <span className="overline">CHAT HISTORY</span>
        <h3>Conversations</h3>
        <Badge variant="outline" className="history-scope"><ShieldCheck size={14} /> {ACCESS_LABELS[access]} access history</Badge>
        <nav className="chat-history-list" aria-label="Saved conversations">
          {history.map((item) => (
            <Link
              key={item.id}
              href={`/chat?conversation=${encodeURIComponent(item.id)}`}
              className={item.id === activeConversationId ? "active" : ""}
              aria-current={item.id === activeConversationId ? "page" : undefined}
              aria-disabled={sending}
              onClick={(event) => {
                if (sending) event.preventDefault();
              }}
            >
              <MessageSquareText size={16} />
              <span><strong>{item.title}</strong><small>{item.message_count} messages · {item.updated_at.slice(0, 10)}</small></span>
            </Link>
          ))}
          {!history.length && (
            <p className="empty-history">No saved conversations yet. Ask a question or create a new chat to begin.</p>
          )}
        </nav>
        <div className="grounding-note"><Sparkles size={17} /><p><strong>History is saved.</strong> Conversations remain available after refresh and stay separated by access scope.</p></div>
      </Card>

      <Card className="chat-surface py-0" aria-label="Atlas conversation">
        <div className="chat-header">
          <div className="atlas-avatar"><Sparkles size={20} /></div>
          <div><strong>Atlas assistant</strong><span><i /> Saved · Retrieval grounded</span></div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void startNewChat()}
            disabled={creating || sending}
          >
            <Plus data-icon="inline-start" /> {creating ? "Creating…" : "New chat"}
          </Button>
        </div>

        <div className="message-feed" aria-live="polite" aria-busy={sending}>
          {messages.map((message) => (
            <article className={`message ${message.role}`} key={message.id}>
              <div className="message-avatar">{message.role === "assistant" ? <Bot size={18} /> : "YOU"}</div>
              <div className="message-body">
                <div className="message-meta">
                  <strong>{message.role === "assistant" ? "Atlas" : "You"}</strong>
                  <span>{message.created_at ? message.created_at.slice(0, 10) : "Ready"}</span>
                </div>
                <div className={`message-content ${message.role === "assistant" ? "formatted-answer" : ""}`}>
                  {message.role === "assistant"
                    ? <MarkdownAnswer content={message.content} />
                    : message.content}
                </div>
                {message.role === "assistant" && message.sources.length ? (
                  <CitationGroup content={message.content} sources={message.sources} />
                ) : null}
              </div>
            </article>
          ))}
          {sending && !streaming && (
            <article className="message assistant">
              <div className="message-avatar"><Bot size={18} /></div>
              <div className="message-body thinking" role="status"><span /><span /><span /><small>Retrieving and reading evidence…</small></div>
            </article>
          )}
          {error && (
            <Alert className="chat-error" variant="destructive">
              <CircleAlert size={17} />
              <AlertDescription>{error}</AlertDescription>
              <AlertAction><Button variant="ghost" size="icon-sm" onClick={() => setError(null)} aria-label="Dismiss error"><X /></Button></AlertAction>
            </Alert>
          )}
          <div ref={endRef} />
        </div>

        <div className="composer-wrap">
          {messages.length === 1 && messages[0].id === "welcome" && documents.length > 0 && (
            <div className="suggestions">
              {SUGGESTED_QUESTIONS.slice(0, 3).map((item) => (
                <Button variant="outline" size="sm" key={item} onClick={() => void submit(undefined, item)}>{item}</Button>
              ))}
            </div>
          )}
          <form className="composer" onSubmit={(event) => void submit(event)}>
            <Textarea
              ref={questionRef}
              aria-label="Question for Atlas"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder={documents.length ? "Ask a question about your knowledge base…" : "Upload a source before asking a question…"}
              disabled={!documents.length || sending}
              rows={2}
            />
            <div className="composer-footer">
              <div className="filter-wrap">
                <Button
                  type="button"
                  variant={selectedDocuments.length ? "secondary" : "ghost"}
                  size="sm"
                  className={`filter-button ${selectedDocuments.length ? "active" : ""}`}
                  onClick={() => setFiltersOpen((current) => !current)}
                  aria-expanded={filtersOpen}
                  aria-controls="source-filter-popover"
                >
                  <FileSearch size={15} /> {selectedDocuments.length ? `${selectedDocuments.length} selected` : "All sources"} <ChevronDown size={14} />
                </Button>
                {filtersOpen && (
                  <Card className="source-filter-popover" id="source-filter-popover">
                    <div><strong>Search scope</strong><Button variant="link" size="xs" type="button" onClick={() => setSelectedDocuments([])}>Use all</Button></div>
                    {documents.map((document) => (
                      <label key={document.id}>
                        <input
                          type="checkbox"
                          checked={selectedDocuments.includes(document.id)}
                          onChange={() => toggleDocument(document.id)}
                        />
                        <span>{document.title}<small>{document.page_count} pages</small></span>
                      </label>
                    ))}
                  </Card>
                )}
              </div>
              <span>Enter to send · Shift + Enter for new line</span>
              <Button className="send-button" size="icon-lg" type="submit" disabled={!question.trim() || sending || !documents.length} aria-label="Send question"><Send /></Button>
            </div>
          </form>
        </div>
      </Card>

    </div>
  );
}

function CitationGroup({ content, sources }: { content: string; sources: Source[] }) {
  const [expanded, setExpanded] = useState(false);
  const citationsId = useId();

  return (
    <div className="citation-group">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={`citation-disclosure ${expanded ? "expanded" : ""}`}
        aria-expanded={expanded}
        aria-controls={citationsId}
        onClick={() => setExpanded((current) => !current)}
      >
        <BookOpenText size={15} aria-hidden="true" />
        <span>{sources.length} retrieved citations</span>
        <span className="citation-disclosure-label">{expanded ? "Collapse" : "Expand"}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </Button>
      <div className="citation-grid" id={citationsId} hidden={!expanded}>
        {sources.map((source) => (
          <CitationCard key={`${source.document_id}-${source.source_number}`} source={source} />
        ))}
      </div>
      <Button variant="ghost" size="sm" className="copy-button" onClick={() => void navigator.clipboard.writeText(content)}>
        <Clipboard data-icon="inline-start" /> Copy answer
      </Button>
    </div>
  );
}

function CitationCard({ source }: { source: Source }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={`citation-card py-0 ${expanded ? "expanded" : ""}`}>
      <span className="citation-number">[{source.source_number}]</span>
      <Button
        type="button"
        variant="ghost"
        className="citation-toggle"
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Expand"} source ${source.source_number}: ${source.document_title}`}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="citation-copy">
          <strong>{source.document_title}</strong>
          <span>Page {source.page_number}{source.section ? ` · ${source.section}` : ""}</span>
          <span className="citation-excerpt">{source.content}</span>
        </span>
        <span className="citation-toggle-label">
          {expanded ? "Collapse" : "Expand"}
          <ChevronDown size={13} aria-hidden="true" />
        </span>
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        nativeButton={false}
        className="citation-open"
        render={<a href={sourceUrl(source.document_id, source.page_number)} target="_blank" rel="noreferrer" />}
        aria-label={`Open ${source.document_title}, page ${source.page_number} in a new tab`}
      >
        <ExternalLink size={15} aria-hidden="true" />
      </Button>
    </Card>
  );
}
