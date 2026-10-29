/**
 * The agent loop - Claude with tools, streamed.
 *
 *   send messages + tools  ->  model streams text and/or tool calls
 *   if it called tools     ->  run them, append the results, ask again
 *   until it answers in plain text (or MAX_STEPS is hit)
 *
 * Text is forwarded to the browser token by token; each tool call shows a status line
 * ("Searching SBG's knowledge base...") the moment the model starts it.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { HistoryTurn } from "@/lib/chat/protocol";
import { checkOutput } from "@/lib/engine/guardrails";
import { hoursStatus } from "@/lib/engine/hours";
import { EFFORT, fallbackParams, getClient, MODEL } from "./client";
import { buildAppState, SYSTEM_PROMPT } from "./prompt";
import { runTool, TOOL_STATUS, TOOLS, type ToolContext } from "./tools";

const MAX_STEPS = 6;
const MAX_TOKENS = 8_000; // room for adaptive thinking plus a short reply

type Block = Anthropic.Beta.BetaContentBlock;
type MessageParam = Anthropic.Beta.BetaMessageParam;

export interface AgentResult {
  ok: boolean;
  text: string;
  failure?: "no_client" | "api_error" | "refusal" | "truncated";
}

/** Text-only history -> API messages. The conversation must open with a user turn. */
export function toMessages(history: HistoryTurn[], userText: string, appState: string): MessageParam[] {
  const messages: MessageParam[] = [];
  for (const turn of history) {
    if (messages.length === 0 && turn.role === "assistant") continue;
    messages.push({ role: turn.role, content: turn.text });
  }
  messages.push({ role: "user", content: [{ type: "text", text: appState }, { type: "text", text: userText }] });
  return messages;
}

/**
 * If a refusal fallback switched models mid-answer, only text from before the switch
 * may be echoed back (thinking and tool calls from the declined attempt are dropped).
 */
function echoable(content: Block[]): Block[] {
  const boundary = content.map((b) => b.type).lastIndexOf("fallback");
  if (boundary === -1) return content;
  return content.filter((b, i) => i > boundary || b.type === "text");
}

export async function runAgent(ctx: ToolContext, history: HistoryTurn[], userText: string): Promise<AgentResult> {
  const client = getClient();
  if (!client) return { ok: false, text: "", failure: "no_client" };

  const messages = toMessages(history, userText, buildAppState(ctx.state, hoursStatus()));
  let text = "";
  let jsonRetries = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    const started = Date.now();
    let message: Anthropic.Beta.BetaMessage;
    let stepText = "";
    try {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        ...fallbackParams(),
        thinking: { type: "adaptive" },
        output_config: { effort: EFFORT },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages,
      });
      for await (const event of stream) {
        if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block.type === "tool_use") ctx.emit({ type: "status", label: TOOL_STATUS[block.name] ?? "Working…" });
          if (block.type === "fallback") ctx.trace("fallback", `Refusal fallback: ${block.from.model} -> ${block.to.model}`);
        } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          // Separate text from successive steps so sentences don't run together.
          const delta = !stepText && text && !/\s$/.test(text) ? `\n\n${event.delta.text}` : event.delta.text;
          stepText += delta;
          ctx.emit({ type: "text", delta });
        }
      }
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // Typed API errors (auth, rate limit, overload...) end the turn; the caller falls back.
      if (err instanceof Anthropic.APIError) {
        ctx.trace("error", `Claude API error ${err.status ?? ""}: ${err.message.slice(0, 160)}`);
        return { ok: false, text, failure: "api_error" };
      }
      // Anything else here is an unparseable streamed tool input: re-issue the step.
      if (jsonRetries++ < 2) {
        ctx.trace("error", "Tool input could not be parsed; retrying the step");
        continue;
      }
      ctx.trace("error", `Agent error: ${err instanceof Error ? err.message : String(err)}`);
      return { ok: false, text, failure: "api_error" };
    }
    text += stepText;

    const usage = message.usage;
    const servedByFallback = (usage.iterations ?? []).some((it) => it.type === "fallback_message");
    ctx.trace("llm", `${message.model} · ${message.stop_reason} · ${Date.now() - started}ms`, {
      model: message.model,
      effort: EFFORT,
      stopReason: message.stop_reason,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadTokens: usage.cache_read_input_tokens,
      cacheWriteTokens: usage.cache_creation_input_tokens,
      servedByFallback,
    });

    if (message.stop_reason === "refusal") {
      // Never run tools from a declined turn.
      return { ok: false, text, failure: "refusal" };
    }

    const content = echoable(message.content);
    const toolCalls = content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (toolCalls.length === 0) break; // the model answered in text: done

    if (message.stop_reason === "max_tokens") {
      // A tool input cut off at max_tokens can still parse; don't run it.
      ctx.trace("error", "Response hit max_tokens mid tool call");
      return { ok: false, text, failure: "truncated" };
    }

    messages.push({ role: "assistant", content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of toolCalls) {
      const t0 = Date.now();
      const output = await runTool(call.name, call.input, ctx);
      ctx.trace("tool", `${call.name} (${Date.now() - t0}ms)${output.isError ? " - invalid input" : ""}`, { input: call.input });
      results.push({ type: "tool_result", tool_use_id: call.id, content: output.content, is_error: output.isError });
    }
    // All results go back together, in one user message.
    messages.push({ role: "user", content: results });
  }

  const correction = checkOutput(text);
  if (correction) {
    ctx.trace("guardrail", "Output guardrail: appended a correction to an approval promise");
    const addition = `\n\n${correction}`;
    ctx.emit({ type: "text", delta: addition });
    text += addition;
  }
  return { ok: true, text };
}
