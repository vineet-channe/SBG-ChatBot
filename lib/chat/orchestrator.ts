/**
 * One conversational turn, end to end. The API route is a thin wrapper around this.
 *
 *   button / intent  ->  guided flow (no model call, instant)
 *   typed text       ->  input guardrails (PII, routing)
 *                         -> rule-matched: escalate or route, no model call
 *                         -> otherwise: Claude with tools (or the offline fallback)
 *   always           ->  the flow decides what to show next (question, estimate, results)
 */
import { runAgent } from "@/lib/agent/agent";
import { offlineTurn } from "@/lib/agent/offline";
import { profileKey, type ToolContext } from "@/lib/agent/tools";
import { evaluate } from "@/lib/engine/eligibility";
import {
  answerLabel, answerToUpdate, buildQuestion, estimateReady, isIntakeComplete, nextQuestion, type Intent,
} from "@/lib/engine/flow";
import { checkInput } from "@/lib/engine/guardrails";
import { hoursStatus } from "@/lib/engine/hours";
import { FIELD_LABELS, mergeProfile, ProfileSchema, type Profile, type ProfileField } from "@/lib/engine/profile";
import { escalate } from "@/lib/handoff/escalate";
import { SBG } from "@/lib/sbg/company";
import { MAX_HISTORY, type ChatEvent, type ChatRequest, type ClientState, type QuickReply, type TraceEvent } from "./protocol";

const INTENTS: Intent[] = ["find", "qualify", "estimate", "existing", "human"];

interface Turn extends ToolContext {
  /** Assistant text produced this turn, recorded in the transcript. */
  said: string[];
  /** True once any assistant text has been streamed this turn (model or template). */
  textEmitted: boolean;
}

export interface TurnOptions {
  /** Schedules work after the response is sent (Next.js `after`). */
  defer?: (task: () => Promise<void>) => void;
}

/** The client owns the state, so never trust it: validate and cap everything. */
export function sanitizeState(raw: Partial<ClientState> | undefined): ClientState {
  const profileResult = ProfileSchema.safeParse(raw?.profile ?? {});
  const profile: Profile = profileResult.success ? profileResult.data : mergeProfile({}, (raw?.profile ?? {}) as Partial<Profile>).profile;
  const history = Array.isArray(raw?.history)
    ? raw.history
        .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.text === "string")
        .map((m) => ({ role: m.role, text: m.text.slice(0, 2_000) }))
        .slice(-MAX_HISTORY)
    : [];
  const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : undefined);
  return {
    sessionId: str(raw?.sessionId, 64) ?? crypto.randomUUID(),
    profile,
    intent: INTENTS.includes(raw?.intent as Intent) ? raw?.intent : undefined,
    history,
    resultsKey: str(raw?.resultsKey, 4_000),
    estimateKey: str(raw?.estimateKey, 4_000),
    ticketId: str(raw?.ticketId, 20),
  };
}

function say(turn: Turn, text: string) {
  turn.emit({ type: "text", delta: turn.textEmitted ? `\n\n${text}` : text });
  turn.said.push(text);
}

function quickReplies(turn: Turn, options: QuickReply[]) {
  turn.emit({ type: "ui", block: { kind: "quick_replies", options } });
}

const START_OPTIONS: QuickReply[] = [
  { label: "Find the right financing", input: { type: "intent", intent: "find" } },
  { label: "See if I qualify", input: { type: "intent", intent: "qualify" } },
  { label: "Estimate my funding", input: { type: "intent", intent: "estimate" } },
];

/** Decides what the guided flow shows next: an estimate, the next question, or results. */
function advance(turn: Turn) {
  const { state } = turn;
  const { profile, intent } = state;
  const key = profileKey(profile);

  if (intent === "estimate" && estimateReady(profile) && state.estimateKey !== key) {
    const result = evaluate(profile);
    state.estimateKey = key;
    if (result.meetsMinimums) {
      say(turn, "Here's what SBG's calculator model estimates for your business. Slide the amount to see how the payment and total cost change.");
      turn.emit({ type: "ui", block: { kind: "estimate", profile, result } });
    } else {
      say(turn, "SBG's calculator only produces an estimate once the published minimums are met. Here's where you stand, and what would change it:");
      turn.emit({ type: "ui", block: { kind: "results", result, profile } });
    }
    turn.trace("flow", "Estimate step complete", { meetsMinimums: result.meetsMinimums });
    quickReplies(turn, [
      { label: "Match me with products", input: { type: "intent", intent: "find" } },
      { label: "Talk to a specialist", input: { type: "intent", intent: "human" } },
    ]);
    return;
  }

  const question = nextQuestion(profile, intent);
  if (question) {
    turn.emit({ type: "ui", block: { kind: "question", question } });
    turn.said.push(question.prompt);
    turn.trace("flow", `Next question: ${FIELD_LABELS[question.field]}`);
    return;
  }

  if (isIntakeComplete(profile, intent) && state.resultsKey !== key) {
    const result = evaluate(profile);
    state.resultsKey = key;
    const failing = result.checks.filter((c) => c.status === "fail");
    say(turn, result.meetsMinimums
      ? "You meet all four of SBG's published minimums. Here's how your business lines up with SBG's programs, best fit first."
      : `You're close - ${failing.map((c) => c.label.toLowerCase()).join(" and ")} ${failing.length === 1 ? "is" : "are"} the gap. Here's what would change it, and what's still open to you:`);
    turn.emit({ type: "ui", block: { kind: "results", result, profile } });
    if (result.fundingEstimate?.qualified && state.estimateKey !== key) {
      turn.emit({ type: "ui", block: { kind: "estimate", profile, result } });
      state.estimateKey = key;
    }
    turn.trace("flow", "Results shown", { meetsMinimums: result.meetsMinimums, top: result.matches.slice(0, 3).map((m) => m.product) });
    quickReplies(turn, [
      { label: "Compare my top options", input: { type: "text", text: "Compare my top two options for me." } },
      { label: "What documents do I need?", input: { type: "text", text: "What documents do I need to apply?" } },
      { label: "Talk to a specialist", input: { type: "intent", intent: "human" } },
    ]);
  }
}

async function handleIntent(turn: Turn, intent: Intent) {
  const labels: Record<Intent, string> = {
    find: "Find the right financing",
    qualify: "See if I qualify",
    estimate: "Estimate my funding",
    existing: "I'm an existing customer",
    human: "Talk to a specialist",
  };
  turn.state.history.push({ role: "user", text: labels[intent] });
  turn.trace("flow", `Intent: ${intent}`);

  switch (intent) {
    case "find":
      turn.state.intent = "find";
      say(turn, Object.keys(turn.state.profile).length
        ? "Let's match you with the right products. Just a few more details."
        : "Let's find the right fit. A few quick questions - about two minutes, and nothing here touches your credit.");
      break;
    case "qualify":
      turn.state.intent = "qualify";
      say(turn, "Let's check you against SBG's published minimums first: a 500+ credit score, 6+ months in business and $150K+ in yearly revenue.");
      break;
    case "estimate":
      turn.state.intent = "estimate";
      say(turn, "I'll run the same model as SBG's online funding calculator. Four quick inputs.");
      break;
    case "existing":
      say(turn, "Welcome back. I can't see account details in chat, since that needs your identity verified, but here's the fastest way to get them:");
      turn.emit({ type: "ui", block: { kind: "existing_customer", hours: hoursStatus() } });
      quickReplies(turn, [
        { label: "How do renewals work?", input: { type: "text", text: "How do renewals work?" } },
        { label: "Can I pay off early?", input: { type: "text", text: "Can I pay off my financing early?" } },
        { label: "Talk to my Relationship Manager", input: { type: "intent", intent: "human" } },
      ]);
      return;
    case "human":
      say(turn, "Of course. I've passed your details to a funding specialist, so you won't have to start over.");
      await escalate(turn, "requested");
      return;
  }
  advance(turn);
}

function handleAnswer(turn: Turn, field: ProfileField, value: string | number) {
  const question = buildQuestion(field, turn.state.profile);
  const update = answerToUpdate(field, value);
  if (!update) throw new Error(`Invalid answer for ${field}`);
  if (field === "purpose" && value === "invoices") update.hasInvoices = true;

  turn.state.history.push({ role: "user", text: answerLabel(question, value) });
  const { profile, changed } = mergeProfile(turn.state.profile, update);
  turn.state.profile = profile;
  turn.state.intent ??= "find";
  turn.emit({ type: "profile", profile, changed, via: "answer" });
  turn.trace("flow", `Answer: ${FIELD_LABELS[field]} = ${answerLabel(question, value)}`, update);
  advance(turn);
}

const ROUTE_REPLIES = {
  human: "Of course. I'll connect you with a funding specialist - I've shared this conversation with them, so you won't have to start over.",
  complaint: "I'm sorry you've had that experience. This should be handled by a person, so I've flagged it as a priority for SBG's team, along with everything we've discussed.",
  hardship: "Thank you for raising this early - that's the best time to do it. Your Relationship Manager can walk through options with you. I've flagged it as a priority and shared the context, so you won't have to explain it twice.",
} as const;

async function handleText(turn: Turn, raw: string) {
  const guard = checkInput(raw.slice(0, 2_000));
  turn.trace("guardrail", guard.matched.length ? `Input checks: ${guard.matched.join(", ")}` : "Input checks: clean", {
    route: guard.route, redactions: guard.redactions, injectionSuspected: guard.injectionSuspected,
  });
  if (guard.redactions.length) {
    turn.emit({ type: "ui", block: { kind: "pii_notice", kinds: guard.redactions.map((r) => r.kind) } });
  }
  const text = guard.text;
  const history = [...turn.state.history];
  turn.state.history.push({ role: "user", text });

  if (guard.route === "human" || guard.route === "complaint" || guard.route === "hardship") {
    say(turn, ROUTE_REPLIES[guard.route]);
    await escalate(turn, guard.route === "human" ? "requested" : guard.route);
    return;
  }
  if (guard.route === "existing_customer") {
    say(turn, "I can't see account details in chat, since that needs your identity verified, but your Relationship Manager or the customer portal can help right away:");
    turn.emit({ type: "ui", block: { kind: "existing_customer", hours: hoursStatus() } });
    return;
  }

  const agent = await runAgent(turn, history, text);
  let reply = agent.text;
  if (!agent.ok) {
    if (agent.failure === "refusal") {
      say(turn, `That's not something I can help with here, but SBG's team can - call ${SBG.phone} or ask me to connect you.`);
    } else if (!agent.text) {
      turn.trace("fallback", agent.failure === "no_client" ? "No API key: retrieval-only mode" : "Claude unavailable: retrieval-only mode");
      reply = await offlineTurn(turn, text, guard.redactions.length > 0);
    } else {
      say(turn, `I lost my connection for a moment. You can ask again, or I can connect you with a specialist at ${SBG.phone}.`);
    }
  }
  if (reply) turn.said.unshift(reply);

  // Show only the passages the answer actually cites.
  const cited = new Set([...reply.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const sources = [...turn.sources.values()].filter((s) => cited.has(s.n)).sort((a, b) => a.n - b.n);
  if (sources.length) turn.emit({ type: "sources", sources });

  if (turn.escalatedTicket) return;
  if (turn.state.intent) advance(turn);
  else if (turn.state.history.length <= 4) quickReplies(turn, START_OPTIONS);
}

export async function handleTurn(request: ChatRequest, emit: (event: ChatEvent) => void, options: TurnOptions = {}): Promise<void> {
  const started = Date.now();
  const trace = (type: TraceEvent["type"], label: string, data?: unknown) =>
    emit({ type: "trace", event: { t: Date.now() - started, type, label, data } });
  const state = sanitizeState(request.state);
  const turn: Turn = {
    state,
    emit: (event) => {
      if (event.type === "text") turn.textEmitted = true;
      emit(event);
    },
    trace,
    defer: options.defer ?? ((task) => void task().catch(() => undefined)),
    sources: new Map(),
    said: [],
    textEmitted: false,
  };

  try {
    const input = request.input;
    trace("input", input.type === "text" ? "Typed message" : input.type === "answer" ? "Guided answer" : "Quick action", input);
    if (input.type === "intent" && INTENTS.includes(input.intent)) await handleIntent(turn, input.intent);
    else if (input.type === "answer") handleAnswer(turn, input.field, input.value);
    else if (input.type === "text" && input.text.trim()) await handleText(turn, input.text.trim());
    else throw new Error("Unsupported input");
  } catch (err) {
    trace("error", err instanceof Error ? err.message : String(err));
    emit({ type: "error", message: `Something went wrong on our side. You can keep going, or call ${SBG.phone}.` });
  }

  if (turn.said.length) state.history.push({ role: "assistant", text: turn.said.join("\n\n").slice(0, 4_000) });
  state.history = state.history.slice(-MAX_HISTORY);
  emit({ type: "state", state });
  emit({ type: "done" });
}
