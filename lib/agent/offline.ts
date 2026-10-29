/**
 * Graceful degradation: what Sterling does when Claude is unavailable (no API key, an
 * outage, a rate limit). The guided flow, rules, calculator and handoff don't need the
 * model at all; for typed messages this module
 *   1. pulls obvious facts out with patterns ("LLC", "$40k a month", "credit 650"), and
 *   2. otherwise answers extractively: it quotes the best-matching passage from the
 *      knowledge base, or offers a specialist when nothing matches.
 * Less fluent than the model, but never wrong in a way the knowledge base isn't.
 */
import { describeField, FIELD_LABELS, mergeProfile, monthsToBucket, type Profile, type ProfileField } from "@/lib/engine/profile";
import { tokenize } from "@/lib/rag/bm25";
import { loadIndex, search } from "@/lib/rag/retriever";
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

/** The passage's opening sentences, plus the bullets that share the most words with the question. */
function excerpt(text: string, question: string): string {
  const lines = text.split("\n");
  const prose = lines.filter((l) => !l.startsWith("- ")).join(" ");
  const opening = (prose.match(/[^.!?]+[.!?]+/g) ?? [prose]).map((s) => s.trim()).slice(0, 3).join(" ");
  const terms = new Set(tokenize(question));
  const bullets = lines
    .map((line, i) => ({ line, i, overlap: tokenize(line).filter((t) => terms.has(t)).length }))
    .filter((b) => b.line.startsWith("- "))
    .sort((a, b) => b.overlap - a.overlap || a.i - b.i)
    .slice(0, 3)
    .sort((a, b) => a.i - b.i)
    .map((b) => b.line);
  return [opening, ...bullets].filter(Boolean).join("\n");
}

const QUESTION_START = /^\s*(what|how|when|where|why|who|which|can|could|do|does|did|is|are|will|would|should)\b/i;

const PII_REPLY =
  "For your security I removed that number from our chat. SBG never needs it here: you'll share what's required in the secure application, and applying only uses a soft credit pull.";

export async function offlineTurn(ctx: ToolContext, text: string, redacted = false): Promise<string> {
  if (redacted) {
    ctx.emit({ type: "text", delta: PII_REPLY });
    return PII_REPLY;
  }
  const question = /\?\s*$/.test(text) || QUESTION_START.test(text);
  const extracted = extractProfile(text);
  // In a question, a product name ("how fast is equipment financing?") isn't a stated need.
  if (question) delete extracted.purpose;
  const { profile, changed } = mergeProfile(ctx.state.profile, extracted);
  if (changed.length > 0) {
    ctx.state.profile = profile;
    if (!ctx.state.intent) ctx.state.intent = "find";
    ctx.emit({ type: "profile", profile, changed, via: "ai" });
    ctx.trace("tool", `Pattern extraction: ${changed.map((f: ProfileField) => FIELD_LABELS[f]).join(", ")}`, extracted);
    if (!question) {
      const noted = changed.map((f) => `${FIELD_LABELS[f].toLowerCase()} (${describeField(f, profile)})`);
      const list = noted.length > 1 ? `${noted.slice(0, -1).join(", ")} and ${noted.at(-1)}` : noted[0];
      const reply = `Thanks - I've noted your ${list} in your funding file.`;
      ctx.emit({ type: "text", delta: reply });
      return reply;
    }
  }

  const result = await search(text, { k: 3 });
  ctx.trace("retrieval", `"${text}" -> ${result.hits.length} passages (${result.confidence} confidence, ${result.ms}ms)`, {
    confidence: result.confidence,
    hits: result.hits.map((h) => ({ id: h.chunk.id, dense: +h.dense.toFixed(3), bm25: +h.bm25.toFixed(2), rrf: +h.rrf.toFixed(4) })),
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

  // Long sections are split into several chunks, and a short continuation can outrank the
  // section's opening, which usually holds the direct answer. Quote the opening when it
  // was retrieved too.
  const position = (id: string) => loadIndex().index.chunks.findIndex((c) => c.id === id);
  const best = result.hits[0].chunk;
  const top = result.hits
    .map((h) => h.chunk)
    .filter((c) => c.section === best.section && c.title === best.title)
    .sort((a, b) => position(a.id) - position(b.id))[0];
  const reply = `From SBG's materials, under **${top.title}**:\n\n${excerpt(top.text, text)} [1]`;
  ctx.sources.set(top.id, { n: 1, title: top.title, section: top.section, url: top.source, snippet: top.text.slice(0, 240) });
  ctx.emit({ type: "text", delta: reply });
  return reply;
}
