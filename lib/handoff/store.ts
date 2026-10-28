/**
 * Handoff tickets - what a human advisor receives when Sterling escalates.
 *
 * The point of a "warm" handoff is that the customer never repeats themselves: the
 * ticket carries the structured profile, the eligibility result, a summary written for
 * the advisor and the (PII-redacted) transcript. A reference code lets a caller who
 * phones in be matched to their chat.
 *
 * Storage is a JSON file so the prototype runs anywhere with no database. In
 * production this would be a CRM / ticketing integration (Salesforce, HubSpot,
 * Zendesk) plus a Slack alert for high-priority tickets.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HandoffReason, HistoryTurn } from "@/lib/chat/protocol";
import type { Profile } from "@/lib/engine/profile";

export interface Ticket {
  id: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  status: "new" | "callback_requested" | "contacted" | "closed";
  reason: HandoffReason;
  priority: "high" | "normal";
  summary: string;
  summarySource: "ai" | "template";
  /** Why the assistant escalated, in its own words (when the model escalated). */
  note?: string;
  profile: Profile;
  meetsMinimums: boolean | null;
  topMatches: string[];
  transcript: HistoryTurn[];
  contact?: { name: string; phone: string; email?: string; bestTime?: string; message?: string };
}

const FILE = process.env.STERLING_HANDOFF_FILE || path.join(process.cwd(), "data", "handoffs.json");
const memory = globalThis as unknown as { __sterlingTickets?: Ticket[]; __sterlingWrite?: Promise<void> };

async function load(): Promise<Ticket[]> {
  if (memory.__sterlingTickets) return memory.__sterlingTickets;
  try {
    memory.__sterlingTickets = JSON.parse(await readFile(FILE, "utf8")) as Ticket[];
  } catch {
    memory.__sterlingTickets = [];
  }
  return memory.__sterlingTickets;
}

/** Writes are chained so two requests can't interleave and lose a ticket. */
function persist(tickets: Ticket[]): Promise<void> {
  memory.__sterlingWrite = (memory.__sterlingWrite ?? Promise.resolve()).then(async () => {
    try {
      await mkdir(path.dirname(FILE), { recursive: true });
      await writeFile(FILE, JSON.stringify(tickets, null, 2));
    } catch {
      // Read-only filesystem (e.g. serverless): keep tickets in memory for this instance.
    }
  });
  return memory.__sterlingWrite;
}

export function newTicketId(): string {
  // Unambiguous characters only, so it can be read out over the phone.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return "SBG-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function createTicket(ticket: Omit<Ticket, "id" | "createdAt" | "updatedAt" | "status">): Promise<Ticket> {
  const tickets = await load();
  const now = new Date().toISOString();
  const created: Ticket = { ...ticket, id: newTicketId(), createdAt: now, updatedAt: now, status: "new" };
  tickets.unshift(created);
  await persist(tickets);
  return created;
}

export async function updateTicket(id: string, patch: Partial<Omit<Ticket, "id" | "createdAt">>): Promise<Ticket | null> {
  const tickets = await load();
  const ticket = tickets.find((t) => t.id === id);
  if (!ticket) return null;
  Object.assign(ticket, patch, { updatedAt: new Date().toISOString() });
  await persist(tickets);
  return ticket;
}

export async function listTickets(): Promise<Ticket[]> {
  return [...(await load())];
}

export async function getTicket(id: string): Promise<Ticket | undefined> {
  return (await load()).find((t) => t.id === id);
}
