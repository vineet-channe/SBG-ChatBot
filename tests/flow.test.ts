import { describe, expect, it } from "vitest";
import { answerToUpdate, isIntakeComplete, nextQuestion, progress, type Intent } from "@/lib/engine/flow";
import type { Profile } from "@/lib/engine/profile";

/** Answers questions with fixed values until the flow stops asking; returns the fields asked, in order. */
function walk(intent: Intent, answers: Partial<Profile>, start: Profile = {}): string[] {
  const asked: string[] = [];
  let profile = { ...start };
  for (let question = nextQuestion(profile, intent); question; question = nextQuestion(profile, intent)) {
    asked.push(question.field);
    const value = answers[question.field];
    if (value === undefined) throw new Error(`no answer for ${question.field}`);
    profile = { ...profile, [question.field]: value };
    if (asked.length > 20) throw new Error("flow did not terminate");
  }
  return asked;
}

const answers: Partial<Profile> = {
  purpose: "payroll",
  amount: 50_000,
  timeline: "asap",
  businessType: "llc",
  industry: "restaurants",
  timeInBusiness: "over_2",
  monthlyRevenue: 50_000,
  creditScore: 640,
  hasInvoices: true,
  repaymentEvent: true,
  ownsHome: false,
};

describe("guided intake", () => {
  it("asks need, then business, then financials when finding financing", () => {
    expect(walk("find", answers)).toEqual([
      "purpose", "amount", "timeline", "businessType", "industry", "timeInBusiness", "monthlyRevenue", "creditScore",
    ]);
  });

  it("asks the four requirements first when checking qualification", () => {
    expect(walk("qualify", answers).slice(0, 3)).toEqual(["timeInBusiness", "monthlyRevenue", "creditScore"]);
  });

  it("asks only the calculator's inputs for an estimate", () => {
    expect(walk("estimate", answers)).toEqual(["amount", "timeInBusiness", "creditScore", "monthlyRevenue"]);
  });

  it("skips questions the customer already answered in their own words", () => {
    const asked = walk("find", answers, { industry: "restaurants", amount: 80_000, creditScore: 700 });
    expect(asked).not.toContain("industry");
    expect(asked).not.toContain("amount");
    expect(asked).not.toContain("creditScore");
  });

  it("asks nothing for existing customers or a request for a person", () => {
    expect(nextQuestion({}, "existing")).toBeNull();
    expect(nextQuestion({}, "human")).toBeNull();
  });
});

describe("conditional questions", () => {
  it("asks about invoices for a general need in an invoice-heavy industry", () => {
    expect(walk("find", { ...answers, industry: "construction" }).at(-1)).toBe("hasInvoices");
    expect(walk("find", answers)).not.toContain("hasInvoices"); // restaurants aren't invoice-heavy
  });

  it("asks about a repayment event for a bridge", () => {
    expect(walk("find", { ...answers, purpose: "bridge" }).at(-1)).toBe("repaymentEvent");
  });

  it("asks about home equity when revenue is short but credit is 600+", () => {
    expect(walk("find", { ...answers, monthlyRevenue: 9_000 }).at(-1)).toBe("ownsHome");
    expect(walk("find", { ...answers, monthlyRevenue: 9_000, creditScore: 575 })).not.toContain("ownsHome");
  });
});

describe("progress", () => {
  it("marks every stage done once the intake is complete", () => {
    const profile = Object.fromEntries(
      ["purpose", "amount", "timeline", "businessType", "industry", "timeInBusiness", "monthlyRevenue", "creditScore"].map((f) => [
        f,
        answers[f as keyof Profile],
      ]),
    ) as Profile;
    expect(isIntakeComplete(profile, "find")).toBe(true);
    const steps = progress(profile, "find");
    expect(steps.answered).toBe(8);
    expect(steps.stages.every((s) => s.status === "done")).toBe(true);
  });
});

describe("answers from question cards", () => {
  it("turns a credit band into its typical score", () => {
    expect(answerToUpdate("creditScore", "600_679")).toEqual({ creditScore: 640 });
  });

  it("parses money from a number or a formatted string", () => {
    expect(answerToUpdate("amount", 75_000)).toEqual({ amount: 75_000 });
    expect(answerToUpdate("monthlyRevenue", "$42,500")).toEqual({ monthlyRevenue: 42_500 });
  });

  it("turns yes and no into booleans", () => {
    expect(answerToUpdate("ownsHome", "yes")).toEqual({ ownsHome: true });
    expect(answerToUpdate("hasInvoices", "no")).toEqual({ hasInvoices: false });
  });
});
