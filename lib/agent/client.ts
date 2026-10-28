/**
 * Anthropic client configuration. Without an API key the app still works: the guided
 * flow, eligibility rules, calculator and handoff are all deterministic, and free-text
 * questions fall back to retrieval-only answers (see lib/agent/offline.ts).
 */
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

/**
 * Effort controls how much the model thinks before answering (Opus 5.5 always uses
 * adaptive thinking). "low" keeps a chat turn snappy; raise it if answers need more care.
 */
export const EFFORT = (process.env.ANTHROPIC_EFFORT || "low") as "low" | "medium" | "high";

/** Server-side refusal fallbacks: if a safety classifier declines, Anthropic retries on a fallback model. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

const cache = globalThis as unknown as { __sterlingClient?: Anthropic | null };

export function getClient(): Anthropic | null {
  if (cache.__sterlingClient !== undefined) return cache.__sterlingClient;
  const configured = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  const forcedOffline = process.env.STERLING_OFFLINE === "1";
  cache.__sterlingClient = configured && !forcedOffline ? new Anthropic({ maxRetries: 2, timeout: 60_000 }) : null;
  return cache.__sterlingClient;
}

export function llmLabel(): string {
  return getClient() ? `${MODEL} (effort: ${EFFORT})` : "offline (retrieval-only)";
}
