export type AccessLevel = "public" | "internal" | "confidential";

export interface Health {
  status: "ok" | "degraded";
  database: string;
  gemini_configured: boolean;
}

export interface DocumentRecord {
  id: string;
  title: string;
  filename: string;
  classification: AccessLevel;
  page_count: number;
  chunk_count: number;
  document_metadata: Record<string, unknown>;
  created_at: string;
}

export interface Source {
  source_number: number;
  document_id: string;
  document_title: string;
  filename: string;
  page_number: number;
  section: string | null;
  content: string;
  score: number;
}

export interface ChatResponse {
  answer: string;
  grounded: boolean;
  sources: Source[];
  conversation: ConversationSummary;
  user_message: ChatMessage;
  assistant_message: ChatMessage;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: Source[];
  grounded: boolean | null;
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface Conversation extends ConversationSummary {
  messages: ChatMessage[];
}
