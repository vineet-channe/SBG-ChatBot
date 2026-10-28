/**
 * Deterministic eligibility and product matching.
 *
 * The language model never decides who qualifies. It calls this code, which applies
 * SBG Funding's published minimums and product rules, and explains the result in
 * plain English. That keeps decisions auditable, testable and consistent: the same
 * profile always gets the same answer.
 *
 * Statuses are deliberately soft ("strong fit", "worth discussing", "not a fit yet")
 * because SBG's advisors review 50+ factors; this is pre-qualification, not approval.
 */
import { SBG } from "@/lib/sbg/company";
import { getIndustry, RESTRICTED_INDUSTRIES } from "@/lib/sbg/industries";
import { PRODUCTS, type ProductId } from "@/lib/sbg/products";
import { estimateFunding, estimateLineOfCredit, type FundingEstimate, type LineOfCreditEstimate } from "./estimator";
import { annualRevenue, money, type Profile, type ProfileField, type Purpose } from "./profile";

export type CheckStatus = "pass" | "fail" | "unknown" | "info";

export interface Check {
  id: "credit" | "time" | "revenue" | "industry" | "documents";
  label: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
}

export type MatchStatus = "strong" | "possible" | "not_now";

export interface ProductMatch {
  product: ProductId;
  status: MatchStatus;
  /** How well the product fits the stated need, roughly 0-5. */
  relevance: number;
  why: string[];
  cautions: string[];
  blockers: string[];
  fixes: string[];
}

export interface EligibilityResult {
  checks: Check[];
  /** true / false once credit, time and revenue are known; null before that. */
  meetsMinimums: boolean | null;
  matches: ProductMatch[];
  fundingEstimate?: FundingEstimate;
  locEstimate?: LineOfCreditEstimate;
  missing: ProfileField[];
}

/** Fields needed before results are meaningful. */
export const REQUIRED_FIELDS: ProfileField[] = [
  "purpose", "amount", "timeline", "businessType", "industry", "timeInBusiness", "monthlyRevenue", "creditScore",
];

// How well each product serves each need (0-3). Mirrors SBG's "Find financing by situation" guidance.
const PURPOSE_FIT: Record<Purpose, Partial<Record<ProductId, number>>> = {
  working_capital: { working_capital: 3, line_of_credit: 3, rbf: 2, term_loan: 1, invoice: 1 },
  payroll: { line_of_credit: 3, working_capital: 2, rbf: 2, invoice: 1 },
  inventory: { line_of_credit: 3, rbf: 2, working_capital: 2, term_loan: 1 },
  equipment: { equipment: 3, term_loan: 2, sba_7a: 1 },
  expansion: { term_loan: 3, sba_7a: 2, working_capital: 1, heloc: 1 },
  invoices: { invoice: 3, line_of_credit: 2, working_capital: 1 },
  acquisition: { sba_7a: 3, bridge: 2, term_loan: 1 },
  bridge: { bridge: 3, line_of_credit: 1, working_capital: 1 },
  emergency: { rbf: 3, working_capital: 2, line_of_credit: 2, term_loan: 1 },
  other: { term_loan: 2, line_of_credit: 2, working_capital: 1, rbf: 1 },
};

const PURPOSE_REASON: Partial<Record<Purpose, Partial<Record<ProductId, string>>>> = {
  working_capital: {
    working_capital: "Sized for one defined operating gap with a fixed payoff date.",
    line_of_credit: "Covers recurring cash gaps - draw, repay and draw again.",
    rbf: "Repayment flexes with your sales, which helps when revenue is uneven.",
  },
  payroll: {
    line_of_credit: "Payroll is the most common use of a line of credit - draw for the gap, repay when cash comes in.",
    working_capital: "A fixed amount to cover a known payroll gap, repaid on schedule.",
    rbf: "Funds in about a day; repayment flexes with your sales.",
  },
  inventory: {
    line_of_credit: "Restock ahead of demand and repay as inventory sells.",
    rbf: "Fast capital for a seasonal stock-up that pays for itself quickly.",
    working_capital: "One lump sum for a large order with a fixed payoff.",
  },
  equipment: {
    equipment: "Up to 90% of the equipment's value; the equipment itself is the collateral.",
    term_loan: "A lump sum you can use for the equipment plus installation or extras.",
  },
  expansion: {
    term_loan: "Built for a specific investment like a renovation or second location.",
    sba_7a: "The longest terms (10-25 years) and prime-based rates for big projects.",
  },
  invoices: {
    invoice: "Advances up to 90% of unpaid invoices instead of waiting 30-90 days.",
    line_of_credit: "Revolving access to bridge the wait on customer payments.",
  },
  acquisition: {
    sba_7a: "SBG's go-to for buying a business or property: up to $5M over 10-25 years.",
    bridge: "Covers a deposit or earnest money while longer-term financing closes.",
  },
  bridge: { bridge: "Made for a defined gap that ends with a known closing or payout." },
  emergency: {
    rbf: "SBG's direct product: same-day decisions and funds in about 24 hours.",
    working_capital: "A fixed amount for the emergency, repaid on a set schedule.",
    line_of_credit: "Same-day draws once approved, for this and the next surprise.",
  },
};

function check(profile: Profile): Check[] {
  const checks: Check[] = [];
  const { fico, monthsInBusiness, annualRevenue: minRevenue, bankStatements } = SBG.minimums;

  if (profile.creditScore === undefined) {
    checks.push({ id: "credit", label: `${fico}+ credit score`, status: "unknown", detail: "Not shared yet" });
  } else if (profile.creditScore >= fico) {
    checks.push({ id: "credit", label: `${fico}+ credit score`, status: "pass", detail: "Meets SBG's minimum" });
  } else {
    checks.push({
      id: "credit", label: `${fico}+ credit score`, status: "fail", detail: "Below SBG's published minimum",
      fix: `SBG's minimum personal FICO score is ${fico}. Revenue and deposits matter more than score above that line.`,
    });
  }

  const t = profile.timeInBusiness;
  if (t === undefined) {
    checks.push({ id: "time", label: `${monthsInBusiness}+ months in business`, status: "unknown", detail: "Not shared yet" });
  } else if (t === "not_started" || t === "under_6") {
    checks.push({
      id: "time", label: `${monthsInBusiness}+ months in business`, status: "fail",
      detail: t === "not_started" ? "Business not yet operating" : "Under 6 months",
      fix: "SBG funds businesses with at least 6 months of history and suggests applying once you cross that mark with steady revenue.",
    });
  } else {
    checks.push({ id: "time", label: `${monthsInBusiness}+ months in business`, status: "pass", detail: "Meets SBG's minimum" });
  }

  const yearly = annualRevenue(profile);
  if (yearly === undefined) {
    checks.push({ id: "revenue", label: "$150K+ annual revenue", status: "unknown", detail: "Not shared yet" });
  } else if (yearly >= minRevenue) {
    checks.push({ id: "revenue", label: "$150K+ annual revenue", status: "pass", detail: `About ${money(yearly, { compact: true })} a year` });
  } else {
    checks.push({
      id: "revenue", label: "$150K+ annual revenue", status: "fail", detail: `About ${money(yearly, { compact: true })} a year`,
      fix: `SBG looks for $150,000+ in yearly revenue (about $12,500 a month); you're at roughly ${money(profile.monthlyRevenue ?? 0)} a month.`,
    });
  }

  if (profile.industry && RESTRICTED_INDUSTRIES.includes(profile.industry)) {
    checks.push({
      id: "industry", label: "Eligible industry", status: "fail", detail: "Not financed by SBG",
      fix: "SBG finances most industries, but not adult entertainment or gambling.",
    });
  } else if (profile.industry) {
    checks.push({ id: "industry", label: "Eligible industry", status: "pass", detail: "SBG finances this industry" });
  }

  checks.push({
    id: "documents", label: `${bankStatements} recent bank statements`, status: "info",
    detail: "All you need to apply - no tax returns",
  });
  return checks;
}

function evaluateProduct(id: ProductId, profile: Profile, checks: Check[]): ProductMatch {
  const product = PRODUCTS[id];
  const industry = getIndustry(profile.industry);
  const recommendation = industry?.recommended.find((r) => r.product === id);
  const match: ProductMatch = { product: id, status: "strong", relevance: 0, why: [], cautions: [], blockers: [], fixes: [] };

  // Relevance: how well it serves the need, nudged by SBG's industry guidance and timing.
  if (profile.purpose) match.relevance += PURPOSE_FIT[profile.purpose][id] ?? 0;
  if (recommendation) match.relevance += 1;
  const reason = profile.purpose ? PURPOSE_REASON[profile.purpose]?.[id] : undefined;
  if (reason) match.why.push(reason);
  if (recommendation && industry) match.why.push(`SBG recommends it for ${lowerFirst(industry.label)} businesses: ${lowerFirst(recommendation.bestFor)}.`);

  const urgent = profile.timeline === "asap" || profile.timeline === "week";
  if (urgent && product.daysToFund > 7) {
    match.relevance -= 1.5;
    match.cautions.push(`Usually takes longer (${product.speedLabel.toLowerCase()}) than your timeline allows.`);
  } else if (urgent && product.daysToFund <= 1) {
    match.why.push("Same-day decisions and funds in about 24 hours.");
  }
  if (profile.timeline === "flexible" && id === "sba_7a") match.relevance += 0.5;
  if (product.collateralLabel === "None" && match.why.length < 3) match.why.push("No collateral required.");

  // Amount fit.
  if (profile.amount !== undefined) {
    if (product.maxAmount && profile.amount > product.maxAmount) {
      match.relevance -= 1;
      match.cautions.push(`Tops out at ${money(product.maxAmount, { compact: true })}, below the ${money(profile.amount, { compact: true })} you need.`);
      if (id === "line_of_credit") match.fixes.push("A term loan covers amounts above $500K.");
    }
    if (product.minAmount && profile.amount < product.minAmount) {
      match.cautions.push(`SBG financing starts at ${money(product.minAmount)}.`);
    }
  }

  // Baseline minimums (HELOC has its own credit floor and no revenue minimum).
  const failed = (cid: Check["id"]) => checks.find((c) => c.id === cid && c.status === "fail");
  for (const cid of ["time", "industry"] as const) {
    const c = failed(cid);
    if (c) { match.blockers.push(c.detail); if (c.fix) match.fixes.push(c.fix); }
  }
  if (!product.skipsRevenueMinimum) {
    const c = failed("revenue");
    if (c) { match.blockers.push(`Revenue below $150K/yr`); if (c.fix) match.fixes.push(c.fix); }
  }
  if (profile.creditScore !== undefined && profile.creditScore < product.minFico) {
    match.blockers.push(`Requires a ${product.minFico}+ credit score`);
    match.fixes.push(id === "heloc"
      ? `A HELOC needs a ${SBG.helocMinFico}+ credit score.`
      : `SBG's minimum personal FICO score is ${product.minFico}.`);
  }

  // Product-specific conditions.
  if (id === "invoice") {
    const hasInvoices = profile.hasInvoices ?? (profile.purpose === "invoices" ? true : undefined);
    if (hasInvoices === false) {
      match.blockers.push("Needs unpaid invoices from business customers");
      match.fixes.push("Invoice financing works once you have unpaid invoices from business or government customers.");
    } else if (hasInvoices === undefined) {
      match.cautions.push("Requires unpaid invoices from business or government customers.");
    } else {
      match.why.push("Approval leans on your customers' credit more than yours.");
    }
  }
  if (id === "bridge") {
    if (profile.repaymentEvent === false) {
      match.blockers.push("Needs a defined repayment event");
      match.fixes.push("Bridge capital is underwritten around a known closing, payout or financing that repays it.");
    } else if (profile.repaymentEvent === undefined) {
      match.cautions.push("You'll need a clear repayment event, like a closing date or committed payout.");
    }
  }
  // Caveats that come with the product for everyone. They're shown, but unlike the
  // cautions above they say nothing about this customer's fit, so they don't lower it.
  const productCaveats: string[] = [];
  if (id === "sba_7a") {
    if (profile.creditScore !== undefined && profile.creditScore < 650) {
      match.cautions.push("SBG notes that scores of 650+ are generally stronger candidates for SBA approval.");
    }
    productCaveats.push("More paperwork: tax returns, a P&L and SBA forms after the initial review.");
  }
  if (id === "heloc") {
    if (profile.ownsHome === false) {
      match.blockers.push("Requires home equity");
    } else {
      match.why.push("Usually lower rates than unsecured financing, because your home secures it.");
      productCaveats.push("Your home is the collateral - borrow with a clear repayment plan.");
    }
  }
  if (id === "equipment" && profile.amount !== undefined && profile.purpose === "equipment") {
    match.why.push(`Could cover up to about ${money(profile.amount * 0.9)} of a ${money(profile.amount)} purchase (90% LTV).`);
  }

  match.why = [...new Set(match.why)].slice(0, 3);
  match.status = match.blockers.length > 0 ? "not_now" : match.cautions.length > 0 || match.relevance < 2 ? "possible" : "strong";
  match.cautions.push(...productCaveats);
  return match;
}

const STATUS_RANK: Record<MatchStatus, number> = { strong: 0, possible: 1, not_now: 2 };

/** "Dental chairs, X-ray units" -> "dental chairs, X-ray units"; leaves acronyms like "HVAC" or "POS" alone. */
function lowerFirst(s: string): string {
  return s.length > 1 && s[1] === s[1].toLowerCase() ? s[0].toLowerCase() + s.slice(1) : s;
}

export function evaluate(profile: Profile): EligibilityResult {
  const checks = check(profile);
  const core = checks.filter((c) => c.id === "credit" || c.id === "time" || c.id === "revenue" || c.id === "industry");
  const meetsMinimums = core.some((c) => c.status === "fail")
    ? false
    : core.filter((c) => c.id !== "industry").every((c) => c.status === "pass") ? true : null;

  const candidates = (Object.keys(PRODUCTS) as ProductId[]).filter((id) => {
    if (id === "heloc") return profile.ownsHome === true;
    return true;
  });
  let matches = candidates
    .map((id) => evaluateProduct(id, profile, checks))
    .filter((m) => m.relevance >= 1 || (m.product === "heloc" && profile.ownsHome === true));

  // Mirror SBG's calculator: when nothing else fits but the owner has home equity, surface the HELOC.
  const nothingElseFits = matches.every((m) => m.product === "heloc" || m.status === "not_now");
  if (nothingElseFits && profile.ownsHome === true) {
    matches = matches.map((m) => (m.product === "heloc" ? { ...m, relevance: m.relevance + 3 } : m));
  }

  matches.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.relevance - a.relevance);

  const result: EligibilityResult = {
    checks,
    meetsMinimums,
    matches,
    missing: REQUIRED_FIELDS.filter((f) => profile[f] === undefined),
  };

  // Estimates use SBG's calculator models, shown only when the published minimums are met.
  const { timeInBusiness, creditScore, monthlyRevenue } = profile;
  if (meetsMinimums && timeInBusiness && creditScore !== undefined && monthlyRevenue !== undefined) {
    result.fundingEstimate = estimateFunding({ timeInBusiness, creditScore, monthlyRevenue, requestedAmount: profile.amount });
    result.locEstimate = estimateLineOfCredit(monthlyRevenue);
  }
  return result;
}

/** Compact, model-friendly summary of a result (used as a tool result and in handoff tickets). */
export function summarizeEligibility(result: EligibilityResult) {
  return {
    meetsPublishedMinimums: result.meetsMinimums,
    checks: result.checks.filter((c) => c.status !== "info").map((c) => ({ requirement: c.label, status: c.status, detail: c.detail, fix: c.fix })),
    matches: result.matches.slice(0, 5).map((m) => ({
      product: PRODUCTS[m.product].name,
      status: m.status === "strong" ? "strong fit" : m.status === "possible" ? "worth discussing" : "not a fit yet",
      why: m.why,
      cautions: m.cautions,
      blockers: m.blockers,
      whatWouldChangeIt: m.fixes,
    })),
    fundingEstimate: result.fundingEstimate?.qualified
      ? {
          maxAmount: result.fundingEstimate.maxOffer.amount,
          payment: result.fundingEstimate.maxOffer.payment,
          frequency: result.fundingEstimate.maxOffer.frequency,
          termMonths: result.fundingEstimate.maxOffer.termMonths,
          totalCost: result.fundingEstimate.maxOffer.totalCost,
          requestedAmountOffer: result.fundingEstimate.requestedOffer,
          requestedExceedsMax: result.fundingEstimate.requestedExceedsMax,
        }
      : result.fundingEstimate
        ? { note: "SBG's online estimator gives no automatic estimate for this profile; an advisor can review factors the model can't see." }
        : undefined,
    lineOfCreditEstimate: result.locEstimate,
    missingInformation: result.missing,
    disclaimer: "Pre-qualification against SBG's published criteria and calculator models - not an offer or approval.",
  };
}
