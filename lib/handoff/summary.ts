/**
 * The note an advisor reads first. A deterministic template is written immediately so
 * the ticket is useful even if the model is unavailable; when it is available, a short
 * model-written summary replaces it a moment later (in the background).
 */
import Anthropic from "@anthropic-ai/sdk";
import { EFFORT, FALLBACK_BETA, getClient, MODEL } from "@/lib/agent/client";
import { describeField, FIELD_LABELS, type ProfileField } from "@/lib/engine/profile";
import { REASON_LABELS, type Ticket } from "./store";

export function templateSummary(t: Pick<Ticket, "profile" | "reason" | "meetsMinimums" | "topMatches" | "transcript" | "note">): string {
  const facts = (Object.keys(FIELD_LABELS) as ProfileField[])
    .map((f) => [FIELD_LABELS[f], describeField(f, t.profile)] as const)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${v}`);
  const lastUser = [...t.transcript].reverse().find((m) => m.role === "user")?.text;
  const parts = [
    `Escalated: ${REASON_LABELS[t.reason]}.`,
    facts.length ? `Profile - ${facts.join("; ")}.` : "No business details captured yet.",
    t.meetsMinimums === true
      ? "Meets SBG's published minimums."
      : t.meetsMinimums === false
        ? "Does not meet at least one published minimum."
        : "Minimums not yet checked.",
    t.topMatches.length ? `Best-fit products: ${t.topMatches.join(", ")}.` : "",
    t.note ? `Assistant note: ${t.note}` : "",
    lastUser ? `Last message: "${lastUser.slice(0, 220)}"` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

export async function aiSummary(ticket: Ticket): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  const input = {
    reason: REASON_LABELS[ticket.reason],
    priority: ticket.priority,
    assistantNote: ticket.note,
    meetsPublishedMinimums: ticket.meetsMinimums,
    bestFitProducts: ticket.topMatches,
    profile: Object.fromEntries(
      (Object.keys(FIELD_LABELS) as ProfileField[])
        .map((f) => [FIELD_LABELS[f], describeField(f, ticket.profile)])
        .filter(([, v]) => v !== undefined),
    ),
    transcript: ticket.transcript.slice(-12),
  };
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: EFFORT },
      system:
        "You write handoff notes for SBG Funding advisors. In at most three short sentences of plain text: who the customer is and what they need; where they stand against SBG's published minimums and which products fit; why they were escalated and anything the advisor should handle with care. Use only the facts provided. No greeting, no bullet points.",
      messages: [{ role: "user", content: JSON.stringify(input) }],
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();
    return text || null;
  } catch {
    return null; // the template summary is already on the ticket
  }
}
