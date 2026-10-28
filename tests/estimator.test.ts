/**
 * The estimator is a port of the scripts behind SBG's public calculators, so these tests
 * pin it to values computed by hand from those scripts' formulas.
 */
import { describe, expect, it } from "vitest";
import { creditPoints, estimateFunding, estimateLineOfCredit, revenueBase, revenuePoints, TIERS } from "@/lib/engine/estimator";

describe("funding calculator model", () => {
  it("scores credit and revenue with SBG's bands", () => {
    expect([549, 550, 599, 600, 679, 680, 719, 720].map(creditPoints)).toEqual([0, 1, 1, 3, 3, 6, 6, 11]);
    expect([8_000, 8_001, 10_000, 10_001, 20_000, 30_000, 40_000, 40_001].map(revenuePoints)).toEqual([1, 2, 2, 3, 3, 6, 9, 14]);
  });

  it("rounds revenue up to its bracket exactly as SBG's script does", () => {
    // The script compares with a strict "<", so exactly $8,000 lands in the $10,000 bracket.
    expect([400, 7_999, 8_000, 15_000, 39_999, 40_000, 55_000].map(revenueBase)).toEqual([
      400, 8_000, 10_000, 20_000, 40_000, 40_000, 55_000,
    ]);
  });

  it("maps every score from 10 to 36 to exactly one tier", () => {
    for (let score = 10; score <= 36; score++) {
      expect(TIERS.filter((t) => score >= t.minScore && score <= t.maxScore)).toHaveLength(1);
    }
  });

  it("prices a mid-tier profile: 2+ years, 600-679 credit, $50K a month", () => {
    const estimate = estimateFunding({ timeInBusiness: "over_2", creditScore: 640, monthlyRevenue: 50_000, requestedAmount: 50_000 });
    expect(estimate.qualified).toBe(true);
    if (!estimate.qualified) return;
    // 11 + 3 + 14 = 28 -> 2.25x revenue, factor 1.26, 24 months twice-monthly (48 payments)
    expect(estimate.score).toBe(28);
    expect(estimate.maxOffer).toMatchObject({
      amount: 112_500,
      payment: 2_950,
      totalCost: 29_250,
      totalRepayment: 141_750,
      numberOfPayments: 48,
      frequency: "Twice-Monthly",
    });
    expect(estimate.requestedOffer).toMatchObject({ amount: 50_000, payment: 1_310, totalCost: 13_000 });
    expect(estimate.requestedExceedsMax).toBe(false);
  });

  it("uses weekly payments in the entry tier", () => {
    // 3 + 6 + 3 = 12 -> 0.75x the $20K bracket, factor 1.22, 12 months of weekly payments
    const estimate = estimateFunding({ timeInBusiness: "6_12", creditScore: 700, monthlyRevenue: 15_000 });
    expect(estimate.qualified && estimate.maxOffer).toMatchObject({
      amount: 15_000,
      payment: 350,
      totalCost: 3_300,
      numberOfPayments: 52,
      frequency: "Weekly",
    });
  });

  it("uses monthly payments in the top tier", () => {
    // 11 + 11 + 14 = 36 -> 2.5x revenue, factor 1.28, 36 monthly payments
    const estimate = estimateFunding({ timeInBusiness: "over_2", creditScore: 750, monthlyRevenue: 60_000 });
    expect(estimate.qualified && estimate.maxOffer).toMatchObject({
      amount: 150_000,
      payment: 5_330,
      totalCost: 42_000,
      numberOfPayments: 36,
      frequency: "Monthly",
    });
  });

  it("gives no automatic estimate below a score of 10, like SBG's calculator", () => {
    const estimate = estimateFunding({ timeInBusiness: "under_6", creditScore: 560, monthlyRevenue: 9_000 });
    expect(estimate).toMatchObject({ qualified: false, score: 4, suggestion: "heloc_or_advisor" });
  });

  it("flags a request above the maximum instead of pricing it", () => {
    const estimate = estimateFunding({ timeInBusiness: "over_2", creditScore: 640, monthlyRevenue: 50_000, requestedAmount: 500_000 });
    expect(estimate.qualified && estimate.requestedExceedsMax).toBe(true);
    expect(estimate.qualified && estimate.requestedOffer).toBeUndefined();
  });
});

describe("line of credit calculator model", () => {
  it("sizes the limit at 2x monthly revenue, rounded up to $5K", () => {
    expect(estimateLineOfCredit(42_300)).toMatchObject({ limit: 85_000, monthlyPayment: 4_533, cappedAtMax: false });
  });

  it("caps the limit at SBG's $500K maximum", () => {
    expect(estimateLineOfCredit(400_000)).toMatchObject({ limit: 500_000, cappedAtMax: true });
  });

  it("returns zeros without revenue", () => {
    expect(estimateLineOfCredit(0)).toMatchObject({ limit: 0, monthlyPayment: 0 });
  });
});
