/**
 * Handoff tickets.
 *   GET    /api/handoff               -> all tickets (the specialist inbox)
 *   POST   /api/handoff  {ticketId, contact}  -> customer requests a callback
 *   PATCH  /api/handoff  {ticketId, status}   -> advisor updates status
 *
 * In production the inbox would sit behind staff SSO; this prototype leaves it open.
 */
import { z } from "zod";
import { redactPII } from "@/lib/engine/guardrails";
import { listTickets, updateTicket } from "@/lib/handoff/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CallbackRequest = z.object({
  ticketId: z.string().regex(/^SBG-[A-Z0-9]{6}$/),
  contact: z.object({
    name: z.string().trim().min(1).max(80),
    phone: z.string().trim().regex(/^[\d\s()+.-]{7,20}$/, "Enter a valid phone number"),
    email: z.union([z.string().trim().email(), z.literal("")]).optional(),
    bestTime: z.string().max(40).optional(),
    message: z.string().max(500).optional(),
  }),
});

const StatusUpdate = z.object({
  ticketId: z.string().regex(/^SBG-[A-Z0-9]{6}$/),
  status: z.enum(["new", "callback_requested", "contacted", "closed"]),
});

export async function GET() {
  return Response.json({ tickets: await listTickets() });
}

export async function POST(request: Request) {
  const parsed = CallbackRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { ticketId, contact } = parsed.data;
  const ticket = await updateTicket(ticketId, {
    status: "callback_requested",
    contact: {
      ...contact,
      email: contact.email || undefined,
      // free-text notes go through the same PII redaction as chat messages
      message: contact.message ? redactPII(contact.message).text : undefined,
    },
  });
  if (!ticket) return Response.json({ error: "Ticket not found" }, { status: 404 });
  return Response.json({ ok: true, ticketId: ticket.id, status: ticket.status });
}

export async function PATCH(request: Request) {
  const parsed = StatusUpdate.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const ticket = await updateTicket(parsed.data.ticketId, { status: parsed.data.status });
  if (!ticket) return Response.json({ error: "Ticket not found" }, { status: 404 });
  return Response.json({ ok: true, ticket });
}
