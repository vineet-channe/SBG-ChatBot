/**
 * One place that performs an escalation, whether a guardrail rule triggered it
 * (deterministic) or the model decided to (escalate_to_human tool).
 */
import type { ChatEvent, ClientState, HandoffReason, TraceEvent } from "@/lib/chat/protocol";
import { evaluate } from "@/lib/engine/eligibility";
import { hoursStatus } from "@/lib/engine/hours";
import { PRODUCTS } from "@/lib/sbg/products";
import { createTicket, getTicket, updateTicket, type Ticket } from "./store";
import { aiSummary, templateSummary } from "./summary";

export interface EscalationContext {
  state: ClientState;
  emit: (event: ChatEvent) => void;
  trace: (type: TraceEvent["type"], label: string, data?: unknown) => void;
  /** Runs work after the response has been sent (Next.js `after`); defaults to fire-and-forget. */
  defer: (task: () => Promise<void>) => void;
}

const HIGH_PRIORITY: HandoffReason[] = ["complaint", "hardship"];

export async function escalate(ctx: EscalationContext, reason: HandoffReason, note?: string): Promise<Ticket> {
  const hours = hoursStatus();

  // One ticket per conversation: a second escalation updates the first (and never lowers its priority).
  const existing = ctx.state.ticketId ? await getTicket(ctx.state.ticketId) : undefined;
  const priority: Ticket["priority"] = HIGH_PRIORITY.includes(reason) || existing?.priority === "high" ? "high" : "normal";
  const result = evaluate(ctx.state.profile);
  const fields = {
    sessionId: ctx.state.sessionId,
    reason,
    priority,
    note,
    profile: ctx.state.profile,
    meetsMinimums: result.meetsMinimums,
    topMatches: result.matches.filter((m) => m.status !== "not_now").slice(0, 3).map((m) => PRODUCTS[m.product].name),
    transcript: ctx.state.history.slice(-16),
  };
  const summary = templateSummary(fields);
  const ticket = existing
    ? (await updateTicket(existing.id, { ...fields, summary, summarySource: "template" }))!
    : await createTicket({ ...fields, summary, summarySource: "template" });

  ctx.state.ticketId = ticket.id;
  ctx.trace("handoff", `${existing ? "Updated" : "Created"} ticket ${ticket.id}`, { reason, priority: ticket.priority, advisorsOpen: hours.open });
  ctx.emit({ type: "ui", block: { kind: "handoff", ticketId: ticket.id, reason, priority: ticket.priority, hours } });

  // A model-written summary replaces the template once it's ready, without delaying the reply.
  ctx.defer(async () => {
    const text = await aiSummary(ticket);
    if (text) await updateTicket(ticket.id, { summary: text, summarySource: "ai" });
  });
  return ticket;
}
