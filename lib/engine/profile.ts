/**
 * The business profile Sterling builds during a conversation - the structured state
 * that the guided flow, the eligibility rules and the estimator all read.
 *
 * Fields mirror SBG's own forms: business types match the first step of
 * apply.sbgfunding.com, and the time-in-business buckets match SBG's calculator.
 */
import { z } from "zod";
import { getIndustry, type IndustryId } from "@/lib/sbg/industries";

export const PURPOSES = [
  { value: "working_capital", label: "Cash flow / working capital", hint: "Cover day-to-day costs" },
  { value: "payroll", label: "Payroll", hint: "Keep the team paid through a gap" },
  { value: "inventory", label: "Inventory or supplies", hint: "Stock up before demand" },
  { value: "equipment", label: "Equipment or vehicles", hint: "Machinery, trucks, technology" },
  { value: "expansion", label: "Expansion or renovation", hint: "New location, build-out, remodel" },
  { value: "invoices", label: "Waiting on customer invoices", hint: "Cash tied up in net-30/60/90" },
  { value: "acquisition", label: "Buying a business or property", hint: "Acquisition or real estate" },
  { value: "bridge", label: "Bridge to a closing or payout", hint: "Cover a gap with a known end" },
  { value: "emergency", label: "Emergency expense", hint: "Something broke, it can't wait" },
  { value: "other", label: "Something else", hint: "Tell me more in your own words" },
] as const;

export const TIMELINES = [
  { value: "asap", label: "As soon as possible", hint: "Within 1-2 days" },
  { value: "week", label: "Within a week" },
  { value: "month", label: "Within a month" },
  { value: "flexible", label: "Just exploring", hint: "No rush" },
] as const;

export const BUSINESS_TYPES = [
  { value: "llc", label: "LLC" },
  { value: "partnership", label: "Partnership" },
  { value: "corporation", label: "Corporation" },
  { value: "sole_prop", label: "Sole Proprietor" },
] as const;

/** Same buckets as sbgfunding.com/sbgfunding-calculator. */
export const TIME_IN_BUSINESS = [
  { value: "not_started", label: "Not yet started", months: 0 },
  { value: "under_6", label: "Less than 6 months", months: 3 },
  { value: "6_12", label: "6-12 months", months: 9 },
  { value: "1_2", label: "1-2 years", months: 18 },
  { value: "over_2", label: "More than 2 years", months: 36 },
] as const;

/** Bands split exactly where SBG's calculator changes scoring (550 / 600 / 680 / 720). */
export const CREDIT_BANDS = [
  { value: "under_500", label: "Below 500", min: 300, max: 499, typical: 480 },
  { value: "500_549", label: "500-549", min: 500, max: 549, typical: 525 },
  { value: "550_599", label: "550-599", min: 550, max: 599, typical: 575 },
  { value: "600_679", label: "600-679", min: 600, max: 679, typical: 640 },
  { value: "680_719", label: "680-719", min: 680, max: 719, typical: 700 },
  { value: "720_plus", label: "720 or higher", min: 720, max: 850, typical: 750 },
] as const;

type Values<T extends readonly { value: string }[]> = T[number]["value"];
export type Purpose = Values<typeof PURPOSES>;
export type Timeline = Values<typeof TIMELINES>;
export type BusinessType = Values<typeof BUSINESS_TYPES>;
export type TimeInBusiness = Values<typeof TIME_IN_BUSINESS>;

const values = <T extends readonly { value: string }[]>(list: T) =>
  list.map((o) => o.value) as unknown as [Values<T>, ...Values<T>[]];

const INDUSTRY_IDS = [
  "restaurants", "retail", "beauty_wellness", "food_trucks", "construction", "hvac", "plumbing", "roofing",
  "manufacturing", "healthcare", "dental", "veterinary", "trucking", "automotive", "gas_stations", "other",
  "gambling", "adult_entertainment",
] as const satisfies readonly IndustryId[];

export const ProfileSchema = z.object({
  purpose: z.enum(values(PURPOSES)).optional(),
  amount: z.number().min(1_000).max(50_000_000).optional(),
  timeline: z.enum(values(TIMELINES)).optional(),
  businessType: z.enum(values(BUSINESS_TYPES)).optional(),
  industry: z.enum(INDUSTRY_IDS).optional(),
  timeInBusiness: z.enum(values(TIME_IN_BUSINESS)).optional(),
  monthlyRevenue: z.number().min(0).max(100_000_000).optional(),
  creditScore: z.number().int().min(300).max(850).optional(),
  hasInvoices: z.boolean().optional(),
  repaymentEvent: z.boolean().optional(),
  ownsHome: z.boolean().optional(),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type ProfileField = keyof Profile;

export function monthsToBucket(months: number): TimeInBusiness {
  if (months <= 0) return "not_started";
  if (months < 6) return "under_6";
  if (months < 12) return "6_12";
  if (months <= 24) return "1_2";
  return "over_2";
}

export function creditBand(score: number | undefined) {
  if (score === undefined) return undefined;
  return CREDIT_BANDS.find((b) => score >= b.min && score <= b.max) ?? CREDIT_BANDS[0];
}

export function annualRevenue(profile: Profile): number | undefined {
  return profile.monthlyRevenue === undefined ? undefined : profile.monthlyRevenue * 12;
}

export const money = (n: number, opts: { compact?: boolean } = {}) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: opts.compact && n >= 100_000 ? "compact" : "standard",
  }).format(n);

const labelOf = <T extends readonly { value: string; label: string }[]>(list: T, v?: string) =>
  list.find((o) => o.value === v)?.label;

/** Human-readable value for each field, used by the funding file panel and summaries. */
export function describeField(field: ProfileField, profile: Profile): string | undefined {
  switch (field) {
    case "purpose": return labelOf(PURPOSES, profile.purpose);
    case "amount": return profile.amount === undefined ? undefined : money(profile.amount);
    case "timeline": return labelOf(TIMELINES, profile.timeline);
    case "businessType": return labelOf(BUSINESS_TYPES, profile.businessType);
    case "industry": return getIndustry(profile.industry)?.label;
    case "timeInBusiness": return labelOf(TIME_IN_BUSINESS, profile.timeInBusiness);
    case "monthlyRevenue": return profile.monthlyRevenue === undefined ? undefined : `${money(profile.monthlyRevenue)}/mo`;
    case "creditScore": {
      const band = creditBand(profile.creditScore);
      return band ? `${band.label}` : undefined;
    }
    case "hasInvoices": return profile.hasInvoices === undefined ? undefined : profile.hasInvoices ? "Yes" : "No";
    case "repaymentEvent": return profile.repaymentEvent === undefined ? undefined : profile.repaymentEvent ? "Yes" : "No";
    case "ownsHome": return profile.ownsHome === undefined ? undefined : profile.ownsHome ? "Yes" : "No";
  }
}

export const FIELD_LABELS: Record<ProfileField, string> = {
  purpose: "Need",
  amount: "Amount",
  timeline: "Timeline",
  businessType: "Business type",
  industry: "Industry",
  timeInBusiness: "Time in business",
  monthlyRevenue: "Monthly revenue",
  creditScore: "Credit score",
  hasInvoices: "Unpaid B2B invoices",
  repaymentEvent: "Repayment event",
  ownsHome: "Home equity",
};

/** Merges an update into a profile, validating every field; invalid fields are dropped. */
export function mergeProfile(profile: Profile, update: Partial<Profile>): { profile: Profile; changed: ProfileField[] } {
  const parsed = ProfileSchema.partial().safeParse(update);
  const clean: Partial<Profile> = {};
  if (parsed.success) Object.assign(clean, parsed.data);
  else {
    // keep the fields that are individually valid
    for (const [key, value] of Object.entries(update)) {
      const field = ProfileSchema.shape[key as ProfileField];
      if (field && field.safeParse(value).success && value !== undefined) (clean as Record<string, unknown>)[key] = value;
    }
  }
  const changed = (Object.keys(clean) as ProfileField[]).filter((k) => clean[k] !== undefined && clean[k] !== profile[k]);
  return { profile: { ...profile, ...stripUndefined(clean) }, changed };
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
