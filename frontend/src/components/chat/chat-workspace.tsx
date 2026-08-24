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
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
          <div className="my-3 max-w-full overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[32rem] border-collapse text-xs">{children}</table>
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
    <div className="grid gap-4 lg:h-[calc(100dvh-13rem)] lg:min-h-[34rem] lg:grid-cols-[15rem_minmax(0,1fr)] lg:grid-rows-1 lg:overflow-hidden xl:grid-cols-[18rem_minmax(0,1fr)]">
      <Card className="h-fit p-4 lg:h-full lg:min-h-0" aria-label="Chat history">
        <span className="text-xs font-semibold tracking-widest text-muted-foreground">CHAT HISTORY</span>
        <h3 className="mt-1 text-lg font-semibold">Conversations</h3>
        <Badge variant="outline" className="mt-3 gap-1"><ShieldCheck size={14} /> {ACCESS_LABELS[access]} access history</Badge>
        <nav className="mt-4 grid max-h-[30rem] gap-1 overflow-y-auto overscroll-contain max-lg:flex max-lg:max-h-none max-lg:overflow-x-auto lg:min-h-0 lg:flex-1" aria-label="Saved conversations">
          {history.map((item) => (
            <Link
              key={item.id}
              href={`/chat?conversation=${encodeURIComponent(item.id)}`}
              className={`grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 rounded-lg border px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-lg:min-w-48 ${item.id === activeConversationId ? "border-primary/20 bg-primary/10 text-foreground" : "border-transparent"}`}
              aria-current={item.id === activeConversationId ? "page" : undefined}
              aria-disabled={sending}
              onClick={(event) => {
                if (sending) event.preventDefault();
              }}
            >
              <MessageSquareText size={16} />
              <span className="grid min-w-0"><strong className="truncate text-xs">{item.title}</strong><small className="truncate text-[0.625rem]">{item.message_count} messages · {item.updated_at.slice(0, 10)}</small></span>
            </Link>
          ))}
          {!history.length && (
            <p className="p-2 text-xs leading-relaxed text-muted-foreground">No saved conversations yet. Ask a question or create a new chat to begin.</p>
          )}
        </nav>
        <Alert className="mt-4 max-lg:hidden"><Sparkles size={17} /><AlertDescription><strong>History is saved.</strong> Conversations remain available after refresh and stay separated by access scope.</AlertDescription></Alert>
      </Card>

      <Card className="flex min-h-[44rem] min-w-0 flex-col gap-0 overflow-hidden py-0 lg:h-full lg:min-h-0" aria-label="Atlas conversation">
        <CardHeader className="flex min-h-16 shrink-0 flex-row items-center gap-3 border-b px-4 py-3">
          <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><Sparkles size={20} /></div>
          <div className="grid"><strong className="text-sm">Atlas assistant</strong><span className="text-xs text-muted-foreground"><i className="mr-1 inline-block size-1.5 rounded-full bg-emerald-500" /> Saved · Retrieval grounded</span></div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void startNewChat()}
            disabled={creating || sending}
            className="ml-auto"
          >
            <Plus data-icon="inline-start" /> {creating ? "Creating…" : "New chat"}
          </Button>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5 sm:px-8" aria-live="polite" aria-busy={sending}>
          {messages.map((message) => (
            <article className="mx-auto mb-7 grid max-w-4xl grid-cols-[1.75rem_minmax(0,1fr)] gap-2 sm:grid-cols-[2rem_minmax(0,1fr)] sm:gap-3" key={message.id}>
              <div className={`grid size-7 place-items-center rounded-lg text-[0.5rem] font-bold sm:size-8 ${message.role === "assistant" ? "bg-primary/10 text-primary" : "bg-primary text-primary-foreground"}`}>{message.role === "assistant" ? <Bot size={18} /> : "YOU"}</div>
              <div className="min-w-0">
                <div className={`flex h-7 items-center gap-2 text-xs ${message.role === "user" ? "justify-end" : ""}`}>
                  <strong>{message.role === "assistant" ? "Atlas" : "You"}</strong>
                  <span className="text-[0.625rem] text-muted-foreground">{message.created_at ? message.created_at.slice(0, 10) : "Ready"}</span>
                </div>
                <div className={`w-fit max-w-full rounded-xl border px-4 py-3 text-sm leading-7 ${message.role === "assistant" ? "formatted-answer bg-muted/40" : "ml-auto border-primary bg-primary text-primary-foreground"}`}>
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
            <article className="mx-auto mb-7 grid max-w-4xl grid-cols-[2rem_minmax(0,1fr)] gap-3">
              <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><Bot size={18} /></div>
              <div className="flex h-12 items-center gap-1" role="status"><span className="size-1.5 animate-pulse rounded-full bg-primary" /><span className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:150ms]" /><span className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:300ms]" /><small className="ml-2 text-xs text-muted-foreground">Retrieving and reading evidence…</small></div>
            </article>
          )}
          {error && (
            <Alert className="mx-auto mb-5 max-w-4xl" variant="destructive">
              <CircleAlert size={17} />
              <AlertDescription>{error}</AlertDescription>
              <AlertAction><Button variant="ghost" size="icon-sm" onClick={() => setError(null)} aria-label="Dismiss error"><X /></Button></AlertAction>
            </Alert>
          )}
          <div ref={endRef} />
        </CardContent>

        <div className="shrink-0 border-t bg-background p-3 sm:p-4">
          {messages.length === 1 && messages[0].id === "welcome" && documents.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto max-sm:hidden">
              {SUGGESTED_QUESTIONS.slice(0, 3).map((item) => (
                <Button variant="outline" size="sm" key={item} onClick={() => void submit(undefined, item)}>{item}</Button>
              ))}
            </div>
          )}
          <form className="mx-auto max-w-4xl rounded-xl border bg-background shadow-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20" onSubmit={(event) => void submit(event)}>
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
              className="min-h-20 resize-none border-0 bg-transparent px-4 pt-3 shadow-none focus-visible:ring-0"
            />
            <div className="flex min-h-11 items-center gap-2 px-2 pb-2">
              <div className="relative">
                <Button
                  type="button"
                  variant={selectedDocuments.length ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setFiltersOpen((current) => !current)}
                  aria-expanded={filtersOpen}
                  aria-controls="source-filter-popover"
                >
                  <FileSearch size={15} /> {selectedDocuments.length ? `${selectedDocuments.length} selected` : "All sources"} <ChevronDown size={14} />
                </Button>
                {filtersOpen && (
                  <Card className="absolute bottom-[calc(100%+0.5rem)] left-0 z-20 grid max-h-72 w-72 overflow-y-auto p-2 shadow-xl" id="source-filter-popover">
                    <div className="mb-1 flex items-center justify-between border-b px-1 pb-2"><strong className="text-xs">Search scope</strong><Button variant="link" size="xs" type="button" onClick={() => setSelectedDocuments([])}>Use all</Button></div>
                    {documents.map((document) => (
                      <label className="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-muted" key={document.id}>
                        <Checkbox
                          checked={selectedDocuments.includes(document.id)}
                          onCheckedChange={() => toggleDocument(document.id)}
                        />
                        <span className="grid min-w-0"><span className="truncate text-xs">{document.title}</span><small className="text-[0.625rem] text-muted-foreground">{document.page_count} pages</small></span>
                      </label>
                    ))}
                  </Card>
                )}
              </div>
              <span className="ml-auto text-[0.625rem] text-muted-foreground max-sm:hidden">Enter to send · Shift + Enter for new line</span>
              <Button size="icon-lg" type="submit" disabled={!question.trim() || sending || !documents.length} aria-label="Send question"><Send /></Button>
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
    <div className="mt-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mb-2 w-full justify-start"
        aria-expanded={expanded}
        aria-controls={citationsId}
        onClick={() => setExpanded((current) => !current)}
      >
        <BookOpenText size={15} aria-hidden="true" />
        <span>{sources.length} retrieved citations</span>
        <span className="ml-auto text-primary">{expanded ? "Collapse" : "Expand"}</span>
        <ChevronDown className={`text-primary transition-transform ${expanded ? "rotate-180" : ""}`} size={14} aria-hidden="true" />
      </Button>
      <div className="grid gap-2" id={citationsId} hidden={!expanded}>
        {sources.map((source) => (
          <CitationCard key={`${source.document_id}-${source.source_number}`} source={source} />
        ))}
      </div>
      <Button variant="ghost" size="sm" className="mt-2" onClick={() => void navigator.clipboard.writeText(content)}>
        <Clipboard data-icon="inline-start" /> Copy answer
      </Button>
    </div>
  );
}

function CitationCard({ source }: { source: Source }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="grid grid-cols-[1.75rem_minmax(0,1fr)_1.75rem] items-start gap-2 p-3">
      <span className="font-mono text-xs font-semibold text-primary">[{source.source_number}]</span>
      <Button
        type="button"
        variant="ghost"
        className="h-auto min-w-0 items-start justify-start whitespace-normal p-0 text-left hover:bg-transparent"
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Expand"} source ${source.source_number}: ${source.document_title}`}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="grid min-w-0 flex-1 gap-1">
          <strong className="truncate text-xs">{source.document_title}</strong>
          <span className="text-[0.625rem] text-muted-foreground">Page {source.page_number}{source.section ? ` · ${source.section}` : ""}</span>
          <span className={`text-xs leading-relaxed text-muted-foreground ${expanded ? "whitespace-pre-wrap" : "line-clamp-2"}`}>{source.content}</span>
        </span>
        <span className="ml-2 inline-flex items-center gap-1 text-[0.625rem] text-primary">
          {expanded ? "Collapse" : "Expand"}
          <ChevronDown className={`transition-transform ${expanded ? "rotate-180" : ""}`} size={13} aria-hidden="true" />
        </span>
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        nativeButton={false}
        className="-mt-1"
        render={<a href={sourceUrl(source.document_id, source.page_number)} target="_blank" rel="noreferrer" />}
        aria-label={`Open ${source.document_title}, page ${source.page_number} in a new tab`}
      >
        <ExternalLink size={15} aria-hidden="true" />
      </Button>
    </Card>
  );
}
