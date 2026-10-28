/** Offline mode's pattern extraction: what it can pull from a message without the model. */
import { describe, expect, it } from "vitest";
import { extractProfile } from "@/lib/agent/offline";

describe("extractProfile", () => {
  it("pulls a whole profile out of one sentence", () => {
    expect(
      extractProfile("I run a roofing company, LLC, 3 years in business, about $80K a month, credit score 640, need $150k for a dump truck ASAP"),
    ).toEqual({
      industry: "roofing",
      businessType: "llc",
      timeInBusiness: "over_2",
      monthlyRevenue: 80_000,
      creditScore: 640,
      amount: 150_000,
      purpose: "equipment",
      timeline: "asap",
    });
  });

  it("converts yearly revenue to monthly", () => {
    expect(extractProfile("We do $1.2M a year in sales and my FICO is 710")).toEqual({ monthlyRevenue: 100_000, creditScore: 710 });
  });

  it("buckets time in business given in months", () => {
    expect(extractProfile("Our dental practice has been open for 18 months")).toEqual({ timeInBusiness: "1_2", industry: "dental" });
  });

  it("ignores small numbers that aren't amounts", () => {
    expect(extractProfile("I need about 5 new chairs")).toEqual({});
  });

  it("reads written-out units", () => {
    expect(extractProfile("Looking for 250 thousand to open a second location")).toEqual({ amount: 250_000, purpose: "expansion" });
  });
});
