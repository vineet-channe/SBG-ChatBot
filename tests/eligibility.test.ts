import { describe, expect, it } from "vitest";
import { evaluate } from "@/lib/engine/eligibility";
import type { Profile } from "@/lib/engine/profile";

const contractor: Profile = {
  purpose: "payroll",
  amount: 50_000,
  timeline: "asap",
  businessType: "llc",
  industry: "construction",
  timeInBusiness: "over_2",
  monthlyRevenue: 50_000,
  creditScore: 640,
};

const statusOf = (profile: Profile) => Object.fromEntries(evaluate(profile).checks.map((c) => [c.id, c.status]));

describe("published minimums", () => {
  it("passes a profile that meets all of them and attaches estimates", () => {
    const result = evaluate(contractor);
    expect(result.meetsMinimums).toBe(true);
    expect(statusOf(contractor)).toMatchObject({ credit: "pass", time: "pass", revenue: "pass", industry: "pass" });
    expect(result.missing).toEqual([]);
    expect(result.fundingEstimate?.qualified).toBe(true);
    expect(result.locEstimate?.limit).toBe(100_000);
  });

  it("stays undecided until credit, time and revenue are known", () => {
    const result = evaluate({ purpose: "payroll" });
    expect(result.meetsMinimums).toBeNull();
    expect(result.missing).toContain("creditScore");
    expect(result.fundingEstimate).toBeUndefined();
  });

  it.each([
    ["credit below 500", { creditScore: 480 }, "credit"],
    ["under 6 months in business", { timeInBusiness: "under_6" }, "time"],
    ["revenue below $150K a year", { monthlyRevenue: 9_000 }, "revenue"],
    ["a restricted industry", { industry: "gambling" }, "industry"],
  ] as const)("fails %s, blocks every product and skips the estimate", (_, change, check) => {
    const profile = { ...contractor, ...change } as Profile;
    const result = evaluate(profile);
    expect(statusOf(profile)[check]).toBe("fail");
    expect(result.meetsMinimums).toBe(false);
    expect(result.matches.every((m) => m.status === "not_now")).toBe(true);
    expect(result.fundingEstimate).toBeUndefined();
  });
});

describe("product matching", () => {
  it("leads with a line of credit for payroll", () => {
    const [first] = evaluate(contractor).matches;
    expect(first).toMatchObject({ product: "line_of_credit", status: "strong" });
  });

  it("surfaces a HELOC when revenue is short but the owner has home equity", () => {
    const [first] = evaluate({ ...contractor, monthlyRevenue: 9_000, ownsHome: true }).matches;
    expect(first.product).toBe("heloc");
    expect(first.status).toBe("possible");
  });

  it("never offers a HELOC without home equity", () => {
    const products = evaluate({ ...contractor, monthlyRevenue: 9_000, ownsHome: false }).matches.map((m) => m.product);
    expect(products).not.toContain("heloc");
  });

  it("blocks invoice financing without unpaid invoices", () => {
    const invoice = evaluate({ ...contractor, purpose: "invoices", hasInvoices: false }).matches.find((m) => m.product === "invoice");
    expect(invoice?.status).toBe("not_now");
    expect(invoice?.blockers).toContain("Needs unpaid invoices from business customers");
  });

  it("ranks SBA 7(a) first for an acquisition with time to spare", () => {
    const [first] = evaluate({ ...contractor, purpose: "acquisition", amount: 900_000, timeline: "flexible", creditScore: 700 }).matches;
    expect(first).toMatchObject({ product: "sba_7a", status: "strong" });
    // product-wide caveats are still shown
    expect(first.cautions.some((c) => c.includes("paperwork"))).toBe(true);
  });

  it("drops slow products below fast ones when the customer needs money now", () => {
    const products = evaluate({ ...contractor, purpose: "acquisition", amount: 900_000, timeline: "asap", creditScore: 700 }).matches;
    const sba = products.find((m) => m.product === "sba_7a");
    expect(products[0].product).not.toBe("sba_7a");
    expect(sba?.cautions.some((c) => c.startsWith("Usually takes longer"))).toBe(true);
  });

  it("is deterministic: the same profile always gets the same answer", () => {
    expect(evaluate(contractor)).toEqual(evaluate({ ...contractor }));
  });
});
