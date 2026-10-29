/**
 * Contract tests for the Claude integration: the real SDK talks to a local mock of
 * the Messages API, so these check the request we send (model, fallbacks, caching,
 * tool definitions, how tool results are echoed back) and how we handle each kind of
 * response (tool calls, text, refusals, API errors, invalid tool input).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMockAnthropic } from "./helpers/mock-anthropic";
import type { ChatEvent, ChatInput, ClientState } from "@/lib/chat/protocol";

let mock: Awaited<ReturnType<typeof startMockAnthropic>>;
let handleTurn: typeof import("@/lib/chat/orchestrator").handleTurn;
let MODEL: string;

beforeAll(async () => {
  mock = await startMockAnthropic();
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ANTHROPIC_BASE_URL = mock.url;
  delete process.env.STERLING_OFFLINE;
  ({ handleTurn } = await import("@/lib/chat/orchestrator"));
  ({ MODEL } = await import("@/lib/agent/client"));
});

afterAll(async () => {
  await mock.close();
});

async function run(state: ClientState, input: ChatInput) {
  const events: ChatEvent[] = [];
  await handleTurn({ state, input }, (e) => events.push(e));
  const text = events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
  const finalState = (events.find((e) => e.type === "state") as { state: ClientState }).state;
  return { events, text, state: finalState };
}

const fresh = (): ClientState => ({ sessionId: "contract", profile: {}, history: [] });

describe("agent loop against the Messages API", () => {
  it("searches the knowledge base, cites the passage and sends a well-formed request", async () => {
    mock.setScript([
      { blocks: [{ type: "thinking" }, { type: "tool_use", id: "toolu_1", name: "search_knowledge_base", input: { query: "line of credit collateral" } }], stopReason: "tool_use" },
      { blocks: [{ type: "text", text: "No. SBG's business line of credit is unsecured, so you don't pledge any assets [1]." }], stopReason: "end_turn" },
    ]);
    const { events, text, state } = await run(fresh(), { type: "text", text: "Do I need collateral for a line of credit?" });

    expect(text).toContain("unsecured");
    expect(events.some((e) => e.type === "status" && e.label.includes("knowledge base"))).toBe(true);
    const sources = events.find((e) => e.type === "sources") as Extract<ChatEvent, { type: "sources" }>;
    expect(sources.sources[0].n).toBe(1);
    expect(sources.sources[0].url).toMatch(/^https:\/\//);

    const [first, second] = mock.requests;
    expect(first.url).toContain("/v1/messages");
    expect(first.headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
    expect(first.body.model).toBe(MODEL);
    expect(first.body.fallbacks).toBe("default");
    expect(first.body.thinking).toEqual({ type: "adaptive" });
    expect(first.body.output_config).toEqual({ effort: "low" });
    expect(first.body.stream).toBe(true);
    expect(first.body.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(first.body.tools.every((t: { eager_input_streaming?: boolean }) => t.eager_input_streaming)).toBe(true);
    expect(first.body.tool_choice).toBeUndefined(); // forced tool use can't be combined with thinking
    const lastUser = first.body.messages.at(-1);
    expect(lastUser.role).toBe("user");
    expect(lastUser.content[0].text).toContain("<app_state>");

    // The assistant turn is echoed back unchanged (thinking block included), followed by the tool result.
    const echoed = second.body.messages.at(-2);
    expect(echoed.role).toBe("assistant");
    expect(echoed.content.map((b: { type: string }) => b.type)).toEqual(["thinking", "tool_use"]);
    expect(echoed.content[0].signature).toBe("sig_1_0");
    const results = second.body.messages.at(-1);
    expect(results.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" });
    expect(JSON.parse(results.content[0].content).results.length).toBeGreaterThan(0);

    expect(state.history.at(-1)).toEqual({ role: "assistant", text: expect.stringContaining("unsecured") });
  });

  it("captures profile facts from free text and hands back to the guided flow", async () => {
    mock.setScript([
      {
        blocks: [{
          type: "tool_use", id: "toolu_p", name: "update_business_profile",
          input: { businessType: "llc", industry: "restaurants", monthlyRevenue: 40000, monthsInBusiness: 24, amount: 50000, purpose: "equipment" },
        }],
        stopReason: "tool_use",
      },
      { blocks: [{ type: "text", text: "Got it: a two-year-old restaurant LLC looking for $50,000 for equipment." }], stopReason: "end_turn" },
    ]);
    const { events, state } = await run(fresh(), {
      type: "text", text: "We're an LLC restaurant, about $40k a month, 2 years in, need $50k for a new oven",
    });
    const profileEvent = events.find((e) => e.type === "profile") as Extract<ChatEvent, { type: "profile" }>;
    expect(profileEvent.via).toBe("ai");
    expect(state.profile).toMatchObject({ businessType: "llc", industry: "restaurants", monthlyRevenue: 40000, timeInBusiness: "1_2", amount: 50000, purpose: "equipment" });
    expect(state.intent).toBe("find");
    // The text comes first, then the next guided question (timeline is the first missing field).
    const kinds = events.filter((e) => e.type === "text" || e.type === "ui").map((e) => (e.type === "ui" ? e.block.kind : "text"));
    expect(kinds.indexOf("question")).toBeGreaterThan(kinds.indexOf("text"));
    const question = events.find((e) => e.type === "ui" && e.block.kind === "question") as Extract<ChatEvent, { type: "ui" }>;
    expect(question.block.kind === "question" && question.block.question.field).toBe("timeline");
  });

  it("escalates when the model decides a person should take over", async () => {
    mock.setScript([
      { blocks: [{ type: "tool_use", id: "toolu_e", name: "escalate_to_human", input: { reason: "complex_deal", note: "Wants SBA guidance to buy a building." } }], stopReason: "tool_use" },
      { blocks: [{ type: "text", text: "I've connected you with a funding specialist who handles SBA purchases." }], stopReason: "end_turn" },
    ]);
    const { events, state } = await run({ ...fresh(), intent: "find" }, { type: "text", text: "Can someone walk me through using SBA to buy our building?" });
    const handoff = events.find((e) => e.type === "ui" && e.block.kind === "handoff") as Extract<ChatEvent, { type: "ui" }>;
    expect(handoff).toBeDefined();
    expect(state.ticketId).toMatch(/^SBG-[A-Z0-9]{6}$/);
    // No guided question after an escalation.
    expect(events.some((e) => e.type === "ui" && e.block.kind === "question")).toBe(false);
  });

  it("returns invalid tool input to the model as an error instead of running it", async () => {
    mock.setScript([
      { blocks: [{ type: "tool_use", id: "toolu_bad", name: "update_business_profile", input: { creditScore: 1200 } }], stopReason: "tool_use" },
      { blocks: [{ type: "text", text: "Could you share your approximate credit score?" }], stopReason: "end_turn" },
    ]);
    const { state } = await run(fresh(), { type: "text", text: "my score is 1200" });
    const toolResult = mock.requests[1].body.messages.at(-1).content[0];
    expect(toolResult.is_error).toBe(true);
    expect(state.profile.creditScore).toBeUndefined();
  });

  it("handles a refusal without running tools", async () => {
    mock.setScript([{ blocks: [], stopReason: "refusal" }]);
    const { text } = await run(fresh(), { type: "text", text: "something the classifier declines" });
    expect(text).toContain("844-284-2725");
  });

  it("leaves out the fallback beta when ANTHROPIC_FALLBACKS=off", async () => {
    process.env.ANTHROPIC_FALLBACKS = "off";
    try {
      mock.setScript([{ blocks: [{ type: "text", text: "Happy to help." }], stopReason: "end_turn" }]);
      await run(fresh(), { type: "text", text: "Hello there" });
      const [request] = mock.requests;
      expect(request.body.fallbacks).toBeUndefined();
      expect(String(request.headers["anthropic-beta"] ?? "")).not.toContain("server-side-fallback");
    } finally {
      delete process.env.ANTHROPIC_FALLBACKS;
    }
  });

  it("falls back to retrieval-only answers when the API errors", async () => {
    mock.setScript([{ httpError: 400, message: "bad request" }]);
    const { events, text } = await run(fresh(), { type: "text", text: "Do you require tax returns to apply?" });
    expect(events.some((e) => e.type === "trace" && e.event.type === "fallback")).toBe(true);
    expect(text).toMatch(/SBG's materials/);
  });
});
