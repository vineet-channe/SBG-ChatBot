/**
 * The tools Sterling's model can call. Each one is a thin, validated wrapper around
 * deterministic code: the model decides *when* to look something up, record a fact,
 * check eligibility, run the calculator or bring in a person - the code decides *what*
 * the answer is.
 *
 * Tool inputs stream eagerly (eager_input_streaming), which means the API no longer
 * validates them, so every input is checked against a zod schema before it runs.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ChatEvent, ClientState, HandoffReason, Source, TraceEvent } from "@/lib/chat/protocol";
import { evaluate, REQUIRED_FIELDS, summarizeEligibility } from "@/lib/engine/eligibility";
import { estimateReady } from "@/lib/engine/flow";
import {
  BUSINESS_TYPES, FIELD_LABELS, PURPOSES, ProfileSchema, TIMELINES,
  describeField, mergeProfile, monthsToBucket, type Profile, type ProfileField,
} from "@/lib/engine/profile";
import { escalate } from "@/lib/handoff/escalate";
import { search } from "@/lib/rag/retriever";
import { INDUSTRIES } from "@/lib/sbg/industries";

export interface ToolContext {
  state: ClientState;
  emit: (event: ChatEvent) => void;
  trace: (type: TraceEvent["type"], label: string, data?: unknown) => void;
  defer: (task: () => Promise<void>) => void;
  /** Passages retrieved this turn, keyed by chunk id, numbered in order of first use. */
  sources: Map<string, Source>;
  /** Set when the model escalated during this turn. */
  escalatedTicket?: string;
}

export const profileKey = (p: Profile) => JSON.stringify(Object.keys(p).sort().map((k) => [k, p[k as ProfileField]]));

const REASONS = ["requested", "existing_customer", "complaint", "hardship", "cannot_answer", "complex_deal", "ready_to_apply"] as const;

export const TOOL_STATUS: Record<string, string> = {
  search_knowledge_base: "Searching SBG's knowledge base…",
  update_business_profile: "Updating your funding file…",
  check_eligibility: "Checking SBG's published requirements…",
  estimate_funding: "Running SBG's funding calculator…",
  escalate_to_human: "Connecting you with a funding specialist…",
};

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_knowledge_base",
    description:
      "Search SBG Funding's knowledge base (products, terms, fees, eligibility, application process, industries, policies, FAQs). " +
      "Call this before stating any fact about SBG. Write the query as a short standalone search phrase, resolving references from earlier turns " +
      "(e.g. 'line of credit draw fee', not 'what about that fee'). Returns numbered passages to cite as [n].",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Standalone search query." } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "update_business_profile",
    description:
      "Record facts the user has shared about their business. Include every field you can infer from the conversation; omit unknown fields. " +
      "Convert annual revenue to monthly and years to months; use the middle of a stated credit range.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        purpose: { type: "string", enum: PURPOSES.map((p) => p.value), description: "What the funds are for." },
        amount: { type: "number", description: "Funding amount needed, in US dollars." },
        timeline: { type: "string", enum: TIMELINES.map((t) => t.value), description: "asap = within a day or two." },
        businessType: { type: "string", enum: BUSINESS_TYPES.map((b) => b.value) },
        industry: {
          type: "string",
          enum: INDUSTRIES.map((i) => i.id),
          description: "Closest industry; 'other' if none fits. SBG does not finance gambling or adult_entertainment.",
        },
        monthsInBusiness: { type: "number", description: "How long the business has been operating, in months." },
        monthlyRevenue: { type: "number", description: "Average gross monthly revenue in US dollars." },
        creditScore: { type: "integer", minimum: 300, maximum: 850, description: "Owner's approximate personal FICO score." },
        hasInvoices: { type: "boolean", description: "Has unpaid invoices from business or government customers." },
        repaymentEvent: { type: "boolean", description: "A known closing, payout or financing will repay a short-term bridge." },
        ownsHome: { type: "boolean", description: "Owns a home with equity." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "check_eligibility",
    description:
      "Check the current profile against SBG's published minimums and product rules. Returns which requirements pass, " +
      "which products fit (and why), what would change a 'not yet', and SBG calculator estimates when available.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "estimate_funding",
    description:
      "Run SBG's public funding calculator model on the profile (needs time in business, credit score and monthly revenue). " +
      "Shows the customer an interactive estimate card. Optionally pass a different requested amount for a what-if.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { requestedAmount: { type: "number", description: "Amount to price instead of the profile's amount." } },
      additionalProperties: false,
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Hand the conversation to an SBG funding specialist. Creates a ticket containing the profile and transcript and shows the " +
      "customer call and callback options. Use when they ask for a person, have an account-specific or sensitive issue, " +
      "need something the knowledge base can't answer, or are ready to pursue a complex deal.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", enum: [...REASONS] },
        note: { type: "string", description: "One sentence for the advisor: what the customer needs." },
      },
      required: ["reason", "note"],
      additionalProperties: false,
    },
  },
];

const SearchInput = z.object({ query: z.string().min(1).max(300) });
// Same validation as the profile itself, except time in business arrives in months.
const ProfileInput = ProfileSchema.omit({ timeInBusiness: true })
  .extend({ monthsInBusiness: z.number().min(0).max(1200).optional() })
  .strict();
const EstimateInput = z.object({ requestedAmount: z.number().positive().optional() }).strict();
const EscalateInput = z.object({ reason: z.enum(REASONS), note: z.string().max(500) });

type ToolOutput = { content: string; isError?: boolean };

function invalid(error: z.ZodError, raw: unknown): ToolOutput {
  return { isError: true, content: JSON.stringify({ INVALID_INPUT: raw, problems: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }) };
}

export async function runTool(name: string, raw: unknown, ctx: ToolContext): Promise<ToolOutput> {
  switch (name) {
    case "search_knowledge_base": {
      const input = SearchInput.safeParse(raw);
      if (!input.success) return invalid(input.error, raw);
      const result = await search(input.data.query, { k: 5 });
      const results = result.hits.map((hit) => {
        let source = ctx.sources.get(hit.chunk.id);
        if (!source) {
          source = {
            n: ctx.sources.size + 1,
            title: hit.chunk.title,
            section: hit.chunk.section,
            url: hit.chunk.source,
            snippet: hit.chunk.text.slice(0, 240),
          };
          ctx.sources.set(hit.chunk.id, source);
        }
        return { ref: source.n, title: `${hit.chunk.section} > ${hit.chunk.title}`, source: hit.chunk.source, text: hit.chunk.text };
      });
      ctx.trace("retrieval", `"${input.data.query}" -> ${result.hits.length} passages (${result.confidence} confidence, ${result.ms}ms)`, {
        query: input.data.query,
        confidence: result.confidence,
        hits: result.hits.map((h) => ({
          id: h.chunk.id, title: `${h.chunk.section} > ${h.chunk.title}`,
          dense: +h.dense.toFixed(3), bm25: +h.bm25.toFixed(2), rrf: +h.rrf.toFixed(4), denseRank: h.denseRank, bm25Rank: h.bm25Rank,
        })),
      });
      return {
        content: JSON.stringify({
          confidence: result.confidence,
          note: result.confidence === "low" ? "Nothing closely matches. Don't answer from general knowledge; say so and offer a specialist." : undefined,
          results,
        }),
      };
    }

    case "update_business_profile": {
      const input = ProfileInput.safeParse(raw);
      if (!input.success) return invalid(input.error, raw);
      const { monthsInBusiness, ...rest } = input.data;
      const update: Partial<Profile> = { ...rest };
      if (monthsInBusiness !== undefined) update.timeInBusiness = monthsToBucket(monthsInBusiness);
      if (update.purpose === "invoices" && ctx.state.profile.hasInvoices === undefined) update.hasInvoices = true;
      const { profile, changed } = mergeProfile(ctx.state.profile, update);
      ctx.state.profile = profile;
      if (!ctx.state.intent && changed.length) ctx.state.intent = "find";
      if (changed.length) ctx.emit({ type: "profile", profile, changed, via: "ai" });
      ctx.trace("tool", `Profile updated: ${changed.map((f) => FIELD_LABELS[f]).join(", ") || "no changes"}`, { input: input.data, changed });
      const saved = Object.fromEntries(changed.map((f) => [FIELD_LABELS[f], describeField(f, profile)]));
      const stillNeeded = REQUIRED_FIELDS.filter((f) => profile[f] === undefined).map((f) => FIELD_LABELS[f]);
      return { content: JSON.stringify({ saved, stillNeededForMatching: stillNeeded }) };
    }

    case "check_eligibility": {
      const result = evaluate(ctx.state.profile);
      const summary = summarizeEligibility(result);
      ctx.trace("tool", `Eligibility checked (meets minimums: ${String(result.meetsMinimums)})`, summary);
      return { content: JSON.stringify(summary) };
    }

    case "estimate_funding": {
      const input = EstimateInput.safeParse(raw ?? {});
      if (!input.success) return invalid(input.error, raw);
      const profile = { ...ctx.state.profile, ...(input.data.requestedAmount ? { amount: input.data.requestedAmount } : {}) };
      if (!estimateReady(profile)) {
        const missing = (["timeInBusiness", "creditScore", "monthlyRevenue"] as ProfileField[]).filter((f) => profile[f] === undefined);
        return { content: JSON.stringify({ needs: missing.map((f) => FIELD_LABELS[f]) }) };
      }
      const result = evaluate(profile);
      if (!result.meetsMinimums) {
        const failing = result.checks.filter((c) => c.status === "fail").map((c) => ({ requirement: c.label, fix: c.fix }));
        ctx.trace("tool", "Estimate withheld: published minimums not met", failing);
        return { content: JSON.stringify({ estimateShown: false, reason: "SBG's published minimums are not met yet.", failing }) };
      }
      ctx.emit({ type: "ui", block: { kind: "estimate", profile, result } });
      if (!input.data.requestedAmount) ctx.state.estimateKey = profileKey(ctx.state.profile);
      const summary = summarizeEligibility(result);
      ctx.trace("tool", "Estimate card shown", summary.fundingEstimate);
      return { content: JSON.stringify({ estimateShown: true, fundingEstimate: summary.fundingEstimate, lineOfCreditEstimate: summary.lineOfCreditEstimate }) };
    }

    case "escalate_to_human": {
      const input = EscalateInput.safeParse(raw);
      if (!input.success) return invalid(input.error, raw);
      const ticket = await escalate(ctx, input.data.reason as HandoffReason, input.data.note);
      ctx.escalatedTicket = ticket.id;
      return {
        content: JSON.stringify({
          ticketId: ticket.id,
          shownToCustomer: "call and callback options with this reference",
          note: "Briefly tell the customer what happens next; don't repeat the phone number unless helpful.",
        }),
      };
    }

    default:
      return { isError: true, content: `Unknown tool: ${name}` };
  }
}
