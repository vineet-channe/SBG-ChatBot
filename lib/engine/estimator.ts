/**
 * Funding estimates, using the same model as SBG Funding's public calculators:
 *   - sbgfunding.com/sbgfunding-calculator   (funding amount, payment, total cost)
 *   - sbgfunding.com/line-of-credit-calculator (credit limit, monthly payment, rate)
 *
 * The constants below are the ones SBG's calculator scripts use, so an estimate in
 * the chat matches what the customer would see on SBG's own site. Like SBG's
 * calculators, these are models, not offers.
 *
 * How the funding model works:
 *   1. Time in business, credit score and monthly revenue each earn points.
 *   2. The total (2-36) picks a pricing tier; below 10 there is no automatic estimate.
 *   3. The tier sets a revenue multiplier, a rate factor, a term and a payment frequency.
 *   4. Max amount = (revenue, rounded up to its bracket) x multiplier, rounded up to $100.
 *   5. Payment = amount x rate factor / number of payments; total cost = amount x (factor - 1).
 */
import type { TimeInBusiness } from "./profile";

export interface Tier {
  minScore: number;
  maxScore: number;
  multiplier: number;
  rateFactor: number;
  termMonths: number;
  frequency: "Weekly" | "Twice-Monthly" | "Monthly";
  paymentsPerMonth: number;
}

export const TIERS: Tier[] = [
  { minScore: 10, maxScore: 16, multiplier: 0.75, rateFactor: 1.22, termMonths: 12, frequency: "Weekly", paymentsPerMonth: 4.33 },
  { minScore: 17, maxScore: 21, multiplier: 1.5, rateFactor: 1.24, termMonths: 15, frequency: "Weekly", paymentsPerMonth: 4.33 },
  { minScore: 22, maxScore: 30, multiplier: 2.25, rateFactor: 1.26, termMonths: 24, frequency: "Twice-Monthly", paymentsPerMonth: 2 },
  { minScore: 31, maxScore: 36, multiplier: 2.5, rateFactor: 1.28, termMonths: 36, frequency: "Monthly", paymentsPerMonth: 1 },
];

const TIME_POINTS: Record<TimeInBusiness, number> = { not_started: 0, under_6: 1, "6_12": 3, "1_2": 6, over_2: 11 };

export function creditPoints(score: number): number {
  if (score < 550) return 0;
  if (score < 600) return 1;
  if (score < 680) return 3;
  if (score < 720) return 6;
  return 11;
}

export function revenuePoints(monthly: number): number {
  if (monthly <= 8_000) return 1;
  if (monthly <= 10_000) return 2;
  if (monthly <= 20_000) return 3;
  if (monthly <= 30_000) return 6;
  if (monthly <= 40_000) return 9;
  return 14;
}

/** Monthly revenue is rounded up to its bracket before the multiplier is applied. */
export function revenueBase(monthly: number): number {
  if (monthly < 500) return monthly;
  for (const ceiling of [8_000, 10_000, 20_000, 30_000, 40_000]) if (monthly < ceiling) return ceiling;
  return monthly;
}

const roundUpTo = (value: number, step: number) => Math.ceil(value / step) * step;

export interface Offer {
  amount: number;
  payment: number;
  totalCost: number;
  totalRepayment: number;
  frequency: Tier["frequency"];
  termMonths: number;
  numberOfPayments: number;
  rateFactor: number;
}

export function offerFor(amount: number, tier: Tier): Offer {
  const principal = roundUpTo(Math.max(0, amount), 100);
  const numberOfPayments = tier.termMonths * tier.paymentsPerMonth;
  const rawPayment = (principal * tier.rateFactor) / numberOfPayments;
  return {
    amount: principal,
    payment: 10 * Math.round(rawPayment / 10),
    totalCost: Math.round(principal * (tier.rateFactor - 1)),
    totalRepayment: Math.round(principal * tier.rateFactor),
    frequency: tier.frequency,
    termMonths: tier.termMonths,
    numberOfPayments: Math.round(numberOfPayments),
    rateFactor: tier.rateFactor,
  };
}

export interface EstimateInput {
  timeInBusiness: TimeInBusiness;
  creditScore: number;
  monthlyRevenue: number;
  requestedAmount?: number;
}

export type FundingEstimate =
  | {
      qualified: true;
      score: number;
      points: { time: number; credit: number; revenue: number };
      tier: Tier;
      tierIndex: number;
      maxOffer: Offer;
      /** Present when the customer asked for less than the maximum. */
      requestedOffer?: Offer;
      requestedExceedsMax: boolean;
    }
  | {
      qualified: false;
      score: number;
      points: { time: number; credit: number; revenue: number };
      /** SBG's calculator suggests a HELOC (600+ FICO) when there is no match. */
      suggestion: "heloc_or_advisor";
    };

export function estimateFunding(input: EstimateInput): FundingEstimate {
  const points = {
    time: TIME_POINTS[input.timeInBusiness],
    credit: creditPoints(input.creditScore),
    revenue: revenuePoints(input.monthlyRevenue),
  };
  const score = points.time + points.credit + points.revenue;
  const tierIndex = TIERS.findIndex((t) => score >= t.minScore && score <= t.maxScore);
  if (tierIndex === -1 || input.monthlyRevenue <= 0) return { qualified: false, score, points, suggestion: "heloc_or_advisor" };

  const tier = TIERS[tierIndex];
  const maxOffer = offerFor(roundUpTo(revenueBase(input.monthlyRevenue) * tier.multiplier, 100), tier);
  const requested = roundUpTo(Math.max(0, input.requestedAmount ?? 0), 100);
  const requestedOffer = requested > 0 && requested < maxOffer.amount ? offerFor(requested, tier) : undefined;
  return {
    qualified: true,
    score,
    points,
    tier,
    tierIndex,
    maxOffer,
    requestedOffer,
    requestedExceedsMax: requested > maxOffer.amount,
  };
}

/** SBG's line-of-credit calculator: limit = 2x monthly revenue (to $5K), factor 1.28 over 24 months. */
export const LOC_MODEL = { multiplier: 2, rateFactor: 1.28, termMonths: 24, roundingIncrement: 5_000, maxLimit: 500_000 };

export interface LineOfCreditEstimate {
  limit: number;
  monthlyPayment: number;
  monthlyRatePct: number;
  cappedAtMax: boolean;
}

export function estimateLineOfCredit(monthlyRevenue: number): LineOfCreditEstimate {
  if (monthlyRevenue <= 0) return { limit: 0, monthlyPayment: 0, monthlyRatePct: 0, cappedAtMax: false };
  const uncapped = roundUpTo(monthlyRevenue * LOC_MODEL.multiplier, LOC_MODEL.roundingIncrement);
  // SBG's calculator script has no cap, but its lines of credit top out at $500K.
  const limit = Math.min(uncapped, LOC_MODEL.maxLimit);
  return {
    limit,
    monthlyPayment: Math.round((limit * LOC_MODEL.rateFactor) / LOC_MODEL.termMonths),
    monthlyRatePct: ((LOC_MODEL.rateFactor - 1) / LOC_MODEL.termMonths) * 100,
    cappedAtMax: uncapped > LOC_MODEL.maxLimit,
  };
}
