/**
 * Graceful degradation: what Sterling does when Claude is unavailable (no API key, an
 * outage, a rate limit). The guided flow, rules, calculator and handoff don't need the
 * model at all; for typed messages this module
 *   1. pulls obvious facts out with patterns ("LLC", "$40k a month", "credit 650"), and
 *   2. otherwise answers extractively: it quotes the best-matching passage from the
 *      knowledge base, or offers a specialist when nothing matches.
 * Less fluent than the model, but never wrong in a way the knowledge base isn't.
 */
import { FIELD_LABELS, mergeProfile, monthsToBucket, type Profile, type ProfileField } from "@/lib/engine/profile";
import { search } from "@/lib/rag/retriever";
import type { IndustryId } from "@/lib/sbg/industries";
import type { ToolContext } from "./tools";

const NUMBER = String.raw`\$?\s?(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|m|mm|million)?\b`;

function toDollars(value: string, unit?: string): number {
  const n = Number(value.replace(/,/g, ""));
  const u = unit?.toLowerCase();
  if (u === "k" || u === "thousand") return n * 1_000;
  if (u === "m" || u === "mm" || u === "million") return n * 1_000_000;
  return n;
}

const INDUSTRY_WORDS: [RegExp, IndustryId][] = [
  [/\b(casino|gambling|betting|sportsbook)\b/i, "gambling"],
  [/\bfood truck/i, "food_trucks"],
  [/\b(restaurant|bar|cafe|café|pizzeria|diner|bakery|catering)\b/i, "restaurants"],
  [/\b(salon|spa|gym|fitness|barber|nail|med ?spa|yoga)\b/i, "beauty_wellness"],
  [/\b(dental|dentist|orthodont)/i, "dental"],
  [/\b(vet|veterinar)/i, "veterinary"],
  [/\b(clinic|medical|doctor|physician|healthcare|chiropract|pharmacy)/i, "healthcare"],
  [/\bhvac\b/i, "hvac"],
  [/\bplumb/i, "plumbing"],
  [/\broof/i, "roofing"],
  [/\b(construction|contractor|remodel|builder|excavat)/i, "construction"],
  [/\bmanufactur/i, "manufacturing"],
  [/\b(trucking|freight|logistics|haul)/i, "trucking"],
  [/\b(auto repair|mechanic|body shop|dealership|collision|tire shop)/i, "automotive"],
  [/\b(gas station|c-store|convenience store)/i, "gas_stations"],
  [/\b(retail|store|shop|boutique|e-?commerce)\b/i, "retail"],
];

const PURPOSE_WORDS: [RegExp, Profile["purpose"]][] = [
  [/\b(buy(ing)? (a|an|the) (business|company|practice|building|property)|acqui(re|sition)|real estate)\b/i, "acquisition"],
  [/\b(bridge|until (the|my) .{0,30}(closes|funds|comes in))\b/i, "bridge"],
  [/\b(invoices?|receivables?|net[- ]?(30|60|90))\b/i, "invoices"],
  [/\bpayroll\b/i, "payroll"],
  [/\b(emergency|broke down|broken|died|urgent repair)\b/i, "emergency"],
  [/\b(equipment|machine|machinery|excavator|oven|vehicle|truck|van|forklift)\b/i, "equipment"],
  [/\b(inventory|stock up|supplies)\b/i, "inventory"],
  [/\b(expand|expansion|renovat|remodel|second location|build-?out|new location)/i, "expansion"],
  [/\b(cash flow|working capital|operating costs)\b/i, "working_capital"],
];

/** Pattern-based extraction of obvious profile facts from free text. */
export function extractProfile(text: string): Partial<Profile> {
  const out: Partial<Profile> = {};
  const lower = text.toLowerCase();

  const monthly = text.match(new RegExp(`${NUMBER}\\s*(?:a|per|/|each)\\s*(?:month|mo)\\b`, "i"));
  const yearly = text.match(new RegExp(`${NUMBER}\\s*(?:a|per|/|each)\\s*(?:year|yr)\\b|(?:annual|yearly) (?:revenue|sales)[^$\\d]{0,20}${NUMBER}`, "i"));
  if (monthly) out.monthlyRevenue = Math.round(toDollars(monthly[1], monthly[2]));
  else if (yearly) {
    const value = yearly[1] ?? yearly[3];
    const unit = yearly[1] ? yearly[2] : yearly[4];
    out.monthlyRevenue = Math.round(toDollars(value, unit) / 12);
  }

  const amount = text.match(new RegExp(`(?:need|looking for|borrow|want|get|raise|request(?:ing)?)\\s+(?:about|around|roughly|up to)?\\s*${NUMBER}`, "i"));
  if (amount) {
    const dollars = toDollars(amount[1], amount[2]);
    if (dollars >= 1_000) out.amount = Math.round(dollars);
  }

  const credit = text.match(/\b(?:credit(?:\s*score)?|fico|score)\D{0,12}(\d{3})\b|\b(\d{3})\s*(?:credit|fico)/i);
  const score = credit ? Number(credit[1] ?? credit[2]) : NaN;
  if (score >= 300 && score <= 850) out.creditScore = score;

  const time = text.match(/\b(\d+(?:\.\d+)?)\s*(years?|yrs?|months?)\b(?=[^.]{0,30}\b(business|open|operating|old|running|around)\b)|\b(?:in business|open|operating|running) (?:for )?(\d+(?:\.\d+)?)\s*(years?|yrs?|months?)/i);
  if (time) {
    const n = Number(time[1] ?? time[4]);
    const unit = (time[2] ?? time[5]).toLowerCase();
    out.timeInBusiness = monthsToBucket(unit.startsWith("y") ? n * 12 : n);
  }

  if (/\b(llc|l\.l\.c\.?)\b/i.test(text)) out.businessType = "llc";
  else if (/\bpartnership\b/i.test(text)) out.businessType = "partnership";
  else if (/\b(corporation|corp\.?|inc\.?|s-corp|c-corp)\b/i.test(text)) out.businessType = "corporation";
  else if (/\bsole prop/i.test(text)) out.businessType = "sole_prop";

  out.industry = INDUSTRY_WORDS.find(([re]) => re.test(text))?.[1];
  out.purpose = PURPOSE_WORDS.find(([re]) => re.test(text))?.[1];
  if (/\b(asap|today|tomorrow|right away|immediately|urgent)\b/.test(lower)) out.timeline = "asap";
  else if (/\bthis week\b|within a week/.test(lower)) out.timeline = "week";

  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as Partial<Profile>;
}

function firstSentences(text: string, n: number): string {
  const lines = text.split("\n");
  const prose = lines.filter((l) => !l.startsWith("- ")).join(" ");
  const sentences = (prose.match(/[^.!?]+[.!?]+/g) ?? [prose]).map((s) => s.trim());
  const bullets = lines.filter((l) => l.startsWith("- ")).slice(0, 3);
  return [sentences.slice(0, n).join(" "), ...bullets].filter(Boolean).join("\n");
}

const PII_REPLY =
  "For your security I removed that number from our chat. SBG never needs it here: you'll share what's required in the secure application, and applying only uses a soft credit pull.";

export async function offlineTurn(ctx: ToolContext, text: string, redacted = false): Promise<string> {
  if (redacted) {
    ctx.emit({ type: "text", delta: PII_REPLY });
    return PII_REPLY;
  }
  const extracted = extractProfile(text);
  const { profile, changed } = mergeProfile(ctx.state.profile, extracted);
  if (changed.length > 0) {
    ctx.state.profile = profile;
    if (!ctx.state.intent) ctx.state.intent = "find";
    ctx.emit({ type: "profile", profile, changed, via: "ai" });
    ctx.trace("tool", `Pattern extraction: ${changed.map((f: ProfileField) => FIELD_LABELS[f]).join(", ")}`, extracted);
    const reply = `Thanks - I've added ${changed.map((f) => FIELD_LABELS[f].toLowerCase()).join(", ")} to your funding snapshot.`;
    ctx.emit({ type: "text", delta: reply });
    return reply;
  }

  const result = await search(text, { k: 3 });
  ctx.trace("retrieval", `"${text}" -> ${result.hits.length} passages (${result.confidence} confidence, ${result.ms}ms)`, {
    confidence: result.confidence,
    hits: result.hits.map((h) => ({ id: h.chunk.id, dense: +h.dense.toFixed(3), bm25: +h.bm25.toFixed(2) })),
  });

  if (result.confidence === "low" || result.hits.length === 0) {
    const reply = "I couldn't find that in SBG's materials, so I don't want to guess. A funding specialist can answer it directly - would you like me to connect you?";
    ctx.emit({ type: "text", delta: reply });
    ctx.emit({ type: "ui", block: { kind: "quick_replies", options: [
      { label: "Talk to a specialist", input: { type: "intent", intent: "human" } },
      { label: "Find the right financing", input: { type: "intent", intent: "find" } },
    ] } });
    return reply;
  }

  const top = result.hits[0].chunk;
  const reply = `Here's what SBG's materials say about **${top.title.toLowerCase()}**:\n\n${firstSentences(top.text, 3)} [1]`;
  ctx.sources.set(top.id, { n: 1, title: top.title, section: top.section, url: top.source, snippet: top.text.slice(0, 240) });
  ctx.emit({ type: "text", delta: reply });
  return reply;
}
