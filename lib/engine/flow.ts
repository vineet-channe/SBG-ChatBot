/**
 * The guided intake: a small state machine that decides which question to ask next.
 *
 * It is deliberately NOT driven by the language model. Button answers are handled here
 * in milliseconds with no API call, the order is predictable, and every visitor sees
 * the same questions SBG's own application asks. The model is only involved when the
 * visitor types free text - and even then it just fills in profile fields; this file
 * still decides what comes next. ("Workflow for the happy path, LLM for the long tail.")
 */
import { evaluate } from "./eligibility";
import {
  BUSINESS_TYPES, CREDIT_BANDS, PURPOSES, TIME_IN_BUSINESS, TIMELINES,
  type Profile, type ProfileField,
} from "./profile";
import { getIndustry, SELECTABLE_INDUSTRIES } from "@/lib/sbg/industries";

export type Intent = "find" | "qualify" | "estimate" | "existing" | "human";
export type Stage = "needs" | "business" | "financials" | "matches";

export const STAGES: { id: Stage; label: string }[] = [
  { id: "needs", label: "Your need" },
  { id: "business", label: "Business" },
  { id: "financials", label: "Financials" },
  { id: "matches", label: "Matches" },
];

export interface OptionChoice { value: string; label: string; hint?: string; group?: string }

export type QuestionInput =
  | { kind: "options"; options: OptionChoice[]; layout: "grid" | "list" | "chips" }
  | { kind: "money"; min: number; max: number; presets: number[]; defaultValue: number; suffix?: string };

export interface Question {
  field: ProfileField;
  stage: Stage;
  prompt: string;
  hint?: string;
  input: QuestionInput;
}

const FIELD_STAGE: Record<ProfileField, Stage> = {
  purpose: "needs", amount: "needs", timeline: "needs",
  businessType: "business", industry: "business", timeInBusiness: "business",
  monthlyRevenue: "financials", creditScore: "financials",
  hasInvoices: "financials", repaymentEvent: "financials", ownsHome: "financials",
};

const ORDER: Record<"find" | "qualify" | "estimate", ProfileField[]> = {
  find: ["purpose", "amount", "timeline", "businessType", "industry", "timeInBusiness", "monthlyRevenue", "creditScore"],
  qualify: ["timeInBusiness", "monthlyRevenue", "creditScore", "industry", "businessType", "purpose", "amount", "timeline"],
  // SBG calculator inputs first (requested amount, time in business, credit, revenue).
  estimate: ["amount", "timeInBusiness", "creditScore", "monthlyRevenue"],
};

/** Fields the estimator needs; once known, the estimate card can be shown. */
export const ESTIMATE_FIELDS: ProfileField[] = ["timeInBusiness", "creditScore", "monthlyRevenue"];

const yesNo: QuestionInput = {
  kind: "options",
  layout: "list",
  options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }],
};

function conditionalQuestions(profile: Profile): ProfileField[] {
  const fields: ProfileField[] = [];
  const industry = getIndustry(profile.industry);
  const generalNeed = ["working_capital", "payroll", "inventory", "other"].includes(profile.purpose ?? "");
  if (profile.hasInvoices === undefined && generalNeed && industry?.invoiceHeavy) fields.push("hasInvoices");
  if (profile.repaymentEvent === undefined && (profile.purpose === "bridge" || profile.purpose === "acquisition")) fields.push("repaymentEvent");
  // SBG's calculator points to a HELOC when the revenue minimum isn't met but credit is 600+.
  if (profile.ownsHome === undefined && profile.creditScore !== undefined && profile.creditScore >= 600) {
    const result = evaluate(profile);
    const revenueFails = result.checks.some((c) => c.id === "revenue" && c.status === "fail");
    const timeOk = result.checks.some((c) => c.id === "time" && c.status === "pass");
    if (revenueFails && timeOk) fields.push("ownsHome");
  }
  return fields;
}

/** The next unanswered question for this intent, or null when the intake is complete. */
export function nextQuestion(profile: Profile, intent: Intent | undefined): Question | null {
  if (!intent || intent === "existing" || intent === "human") return null;
  const order = ORDER[intent];
  const field = order.find((f) => profile[f] === undefined);
  if (field) return buildQuestion(field, profile);
  if (intent === "estimate") return null; // the estimate card shows next; matching is opt-in
  const extra = conditionalQuestions(profile).find((f) => profile[f] === undefined);
  return extra ? buildQuestion(extra, profile) : null;
}

export function isIntakeComplete(profile: Profile, intent: Intent | undefined): boolean {
  return (intent === "find" || intent === "qualify") && nextQuestion(profile, intent) === null;
}

export function estimateReady(profile: Profile): boolean {
  return ESTIMATE_FIELDS.every((f) => profile[f] !== undefined);
}

/** Progress for the stepper: which stages are complete for this intent. */
export function progress(profile: Profile, intent: Intent | undefined) {
  const fields = intent === "qualify" ? ORDER.qualify : ORDER.find;
  const answered = fields.filter((f) => profile[f] !== undefined).length;
  const pending = nextQuestion(profile, intent);
  const complete = isIntakeComplete(profile, intent);
  const activeStage: Stage = complete ? "matches" : pending ? pending.stage : "needs";
  const stages = STAGES.map((s) => {
    if (complete) return { ...s, status: "done" as const };
    if (s.id === activeStage && pending) return { ...s, status: "active" as const };
    const stageFields = fields.filter((f) => FIELD_STAGE[f] === s.id);
    const done = stageFields.length > 0 && stageFields.every((f) => profile[f] !== undefined);
    return { ...s, status: done ? ("done" as const) : s.id === activeStage ? ("active" as const) : ("todo" as const) };
  });
  return { answered, total: fields.length, stages, complete };
}

export function buildQuestion(field: ProfileField, profile: Profile): Question {
  const stage = FIELD_STAGE[field];
  switch (field) {
    case "purpose":
      return {
        field, stage, prompt: "What do you need the funding for?",
        input: { kind: "options", layout: "grid", options: PURPOSES.map((p) => ({ value: p.value, label: p.label, hint: p.hint })) },
      };
    case "amount":
      return {
        field, stage,
        prompt: profile.purpose === "equipment" ? "Roughly how much does the equipment cost?" : "How much funding are you looking for?",
        hint: "SBG funds $5,000 to $10 million. A ballpark is fine.",
        input: { kind: "money", min: 5_000, max: 10_000_000, presets: [25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000], defaultValue: 100_000 },
      };
    case "timeline":
      return {
        field, stage, prompt: "How soon do you need the funds?",
        input: { kind: "options", layout: "list", options: TIMELINES.map((t) => ({ value: t.value, label: t.label, hint: "hint" in t ? t.hint : undefined })) },
      };
    case "businessType":
      return {
        field, stage, prompt: "What type of business do you own?",
        input: { kind: "options", layout: "list", options: BUSINESS_TYPES.map((b) => ({ value: b.value, label: b.label })) },
      };
    case "industry": {
      const type = BUSINESS_TYPES.find((b) => b.value === profile.businessType);
      const noun = type && type.value !== "sole_prop" ? type.label : "business";
      return {
        field, stage, prompt: `Which industry best describes your ${noun}?`,
        input: { kind: "options", layout: "chips", options: SELECTABLE_INDUSTRIES.map((i) => ({ value: i.id, label: i.label, group: i.group })) },
      };
    }
    case "timeInBusiness":
      return {
        field, stage, prompt: "How long has the business been operating?",
        input: { kind: "options", layout: "list", options: TIME_IN_BUSINESS.map((t) => ({ value: t.value, label: t.label })) },
      };
    case "monthlyRevenue":
      return {
        field, stage, prompt: "What are your average monthly sales?",
        hint: "Gross revenue before expenses - roughly what lands in your business account each month.",
        input: { kind: "money", min: 0, max: 1_000_000, presets: [10_000, 15_000, 25_000, 50_000, 100_000, 250_000], defaultValue: 25_000, suffix: "/mo" },
      };
    case "creditScore":
      return {
        field, stage, prompt: "What's your approximate personal credit score?",
        hint: "Only used for this pre-check. Applying with SBG is a soft pull and never affects your score.",
        input: { kind: "options", layout: "grid", options: CREDIT_BANDS.map((b) => ({ value: b.value, label: b.label })) },
      };
    case "hasInvoices":
      return { field, stage, prompt: "Do you have unpaid invoices from business or government customers?", hint: "If so, invoice financing can advance up to 90% of them.", input: yesNo };
    case "repaymentEvent":
      return { field, stage, prompt: "Is there a specific event that will repay this - like an SBA loan closing, a sale or a contract payment?", input: yesNo };
    case "ownsHome":
      return { field, stage, prompt: "Do you own a home with equity?", hint: "SBG's business HELOC has no $150K revenue minimum (600+ credit required).", input: yesNo };
  }
}

/** Converts a widget answer ("yes", "600_679", 25000) into a typed profile update. */
export function answerToUpdate(field: ProfileField, value: string | number): Partial<Profile> | null {
  switch (field) {
    case "amount":
    case "monthlyRevenue": {
      const n = typeof value === "number" ? value : Number(String(value).replace(/[^\d.]/g, ""));
      return Number.isFinite(n) ? { [field]: Math.round(n) } : null;
    }
    case "creditScore": {
      const band = CREDIT_BANDS.find((b) => b.value === value);
      if (band) return { creditScore: band.typical };
      const n = Number(value);
      return Number.isFinite(n) ? { creditScore: Math.round(n) } : null;
    }
    case "hasInvoices":
    case "repaymentEvent":
    case "ownsHome":
      return { [field]: value === "yes" || value === "true" || value === 1 };
    default:
      return { [field]: value } as Partial<Profile>;
  }
}

/** Label for an answer, shown in the user's chat bubble. */
export function answerLabel(question: Question, value: string | number): string {
  if (question.input.kind === "money") {
    const n = Number(value);
    const text = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
    return question.input.suffix ? `${text}${question.input.suffix}` : text;
  }
  return question.input.options.find((o) => o.value === value)?.label ?? String(value);
}
