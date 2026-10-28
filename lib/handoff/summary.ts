/**
 * The note an advisor reads first. A deterministic template is written immediately so
 * the ticket is useful even if the model is unavailable; when it is available, a short
 * model-written summary replaces it a moment later (in the background).
 */
import Anthropic from "@anthropic-ai/sdk";
import { EFFORT, FALLBACK_BETA, getClient, MODEL } from "@/lib/agent/client";
import { REASON_LABELS, SERVICING_REASONS } from "@/lib/chat/protocol";
import { describeField, FIELD_LABELS, money, type ProfileField, type Purpose, type Timeline } from "@/lib/engine/profile";
import type { Ticket } from "./store";

const NEEDS: Record<Purpose, string> = {
  working_capital: "working capital",
  payroll: "payroll",
  inventory: "inventory or supplies",
  equipment: "equipment or vehicles",
  expansion: "an expansion or renovation",
  invoices: "cash tied up in unpaid invoices",
  acquisition: "buying a business or property",
  bridge: "a bridge to a closing or payout",
  emergency: "an emergency expense",
  other: "another purpose",
};

const WHEN: Record<Timeline, string> = {
  asap: "as soon as possible",
  week: "within a week",
  month: "within a month",
  flexible: "with no rush",
};

const sentence = (parts: (string | undefined | false)[], sep = ", ") => {
  const text = parts.filter(Boolean).join(sep);
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}.` : "";
};

/** A readable note in the order an advisor needs it: why, who, what, where they stand. */
export function templateSummary(t: Pick<Ticket, "profile" | "reason" | "meetsMinimums" | "topMatches" | "transcript" | "note">): string {
  const p = t.profile;
  const tib = p.timeInBusiness === "not_started" ? "not yet operating" : p.timeInBusiness && `${describeField("timeInBusiness", p)!.toLowerCase()} in business`;
  const who = sentence([
    [describeField("industry", p), describeField("businessType", p)].filter(Boolean).join(" "),
    tib,
    p.monthlyRevenue !== undefined && `${describeField("monthlyRevenue", p)} in revenue`,
    p.creditScore !== undefined && `credit ${describeField("creditScore", p)}`,
  ]);
  const need = p.amount !== undefined || p.purpose
    ? sentence([
        `wants ${p.amount !== undefined ? money(p.amount) : "funding"}${p.purpose ? ` for ${NEEDS[p.purpose]}` : ""}`,
        p.timeline && WHEN[p.timeline],
      ])
    : "";
  const fit = SERVICING_REASONS.includes(t.reason)
    ? ""
    : t.meetsMinimums === null
      ? "Published minimums not checked yet."
      : sentence(
          [
            t.meetsMinimums ? "meets SBG's published minimums" : "misses at least one published minimum",
            t.topMatches.length > 0 && `best fits: ${t.topMatches.join(", ")}`,
          ],
          "; ",
        );
  const lastUser = [...t.transcript].reverse().find((m) => m.role === "user")?.text;
  return [
    `${REASON_LABELS[t.reason]}.`,
    who || "No business details captured yet.",
    need,
    fit,
    t.note ? `Assistant note: ${t.note}` : "",
    lastUser ? `Last message: "${lastUser.length > 220 ? `${lastUser.slice(0, 220)}...` : lastUser}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
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
