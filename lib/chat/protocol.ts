/**
 * The contract between the browser and POST /api/chat.
 *
 * The server is stateless: the client sends the conversation state with every request
 * and gets back a stream of newline-delimited JSON events (NDJSON). Each event is
 * small and self-describing, so the UI can render text as it streams, update the
 * snapshot panel the moment a field is captured, and show the trace in the inspector.
 */
import type { EligibilityResult } from "@/lib/engine/eligibility";
import type { Intent, Question } from "@/lib/engine/flow";
import type { HoursStatus } from "@/lib/engine/hours";
import type { Profile, ProfileField } from "@/lib/engine/profile";

export interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ClientState {
  sessionId: string;
  profile: Profile;
  intent?: Intent;
  /** Text-only transcript, newest last (capped server-side). */
  history: HistoryTurn[];
  /** Profile snapshot the latest results / estimate were shown for (prevents repeats). */
  resultsKey?: string;
  estimateKey?: string;
  ticketId?: string;
}

export type ChatInput =
  | { type: "text"; text: string }
  | { type: "answer"; field: ProfileField; value: string | number }
  | { type: "intent"; intent: Intent };

export interface ChatRequest {
  state: ClientState;
  input: ChatInput;
}

export interface Source {
  n: number;
  title: string;
  section: string;
  url: string;
  snippet: string;
}

export interface QuickReply {
  label: string;
  input: ChatInput;
}

export type HandoffReason =
  | "requested"
  | "complaint"
  | "hardship"
  | "existing_customer"
  | "complex_deal"
  | "cannot_answer"
  | "ready_to_apply";

export const REASON_LABELS: Record<HandoffReason, string> = {
  requested: "Asked for a person",
  complaint: "Complaint or legal concern",
  hardship: "Payment hardship",
  existing_customer: "Existing customer request",
  complex_deal: "Complex deal",
  cannot_answer: "Question outside the knowledge base",
  ready_to_apply: "Ready to apply",
};

/**
 * Tickets about an existing relationship rather than new financing. They carry no product
 * suggestions: an advisor helping with hardship or a complaint shouldn't be handed a list
 * of new products to pitch.
 */
export const SERVICING_REASONS: readonly HandoffReason[] = ["complaint", "hardship", "existing_customer"];

export type UIBlock =
  | { kind: "question"; question: Question }
  | { kind: "results"; result: EligibilityResult; profile: Profile }
  | { kind: "estimate"; profile: Profile; result: EligibilityResult }
  | { kind: "handoff"; ticketId: string; reason: HandoffReason; priority: "high" | "normal"; hours: HoursStatus }
  | { kind: "existing_customer"; hours: HoursStatus }
  | { kind: "pii_notice"; kinds: string[] }
  | { kind: "quick_replies"; options: QuickReply[] };

export interface TraceEvent {
  /** Milliseconds since the request started. */
  t: number;
  type: "input" | "guardrail" | "flow" | "tool" | "retrieval" | "llm" | "handoff" | "fallback" | "error";
  label: string;
  data?: unknown;
}

export type ChatEvent =
  | { type: "status"; label: string }
  | { type: "text"; delta: string }
  | { type: "sources"; sources: Source[] }
  | { type: "ui"; block: UIBlock }
  | { type: "profile"; profile: Profile; changed: ProfileField[]; via: "answer" | "ai" }
  | { type: "trace"; event: TraceEvent }
  | { type: "state"; state: ClientState }
  | { type: "error"; message: string }
  | { type: "done" };

export const MAX_HISTORY = 24;
