/** Retrieval-only mode: what it can pull from a message, and how it answers, without the model. */
import { describe, expect, it } from "vitest";
import { extractProfile, offlineTurn } from "@/lib/agent/offline";
import type { ToolContext } from "@/lib/agent/tools";

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

describe("offlineTurn", () => {
  const context = () =>
    ({ state: { sessionId: "test", profile: {}, history: [] }, emit: () => {}, trace: () => {}, defer: () => {}, sources: new Map() }) as unknown as ToolContext;

  it("notes business details from a statement", async () => {
    const ctx = context();
    const reply = await offlineTurn(ctx, "I run a roofing company, an LLC, 3 years in business, about $80K a month");
    expect(ctx.state.profile).toMatchObject({ industry: "roofing", businessType: "llc", monthlyRevenue: 80_000 });
    expect(reply).toContain("in your funding file");
  });

  it("answers a question instead of treating a product name as a need", async () => {
    const ctx = context();
    const reply = await offlineTurn(ctx, "How fast can equipment financing fund?");
    expect(ctx.state.profile).toEqual({});
    expect(reply).toMatch(/^From SBG's materials, under \*\*Equipment financing\*\*/);
  });

  it("quotes the opening of a split section, where the direct answer is", async () => {
    const reply = await offlineTurn(context(), "What do I need to apply?");
    expect(reply).toContain("4 most recent business bank statements");
  });

  it("declines when nothing in the knowledge base matches", async () => {
    const reply = await offlineTurn(context(), "Who won the World Series in 1986?");
    expect(reply).toMatch(/couldn't find that in SBG's materials/);
  });
});
