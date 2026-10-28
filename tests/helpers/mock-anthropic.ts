/**
 * A tiny stand-in for the Anthropic Messages API, for contract tests.
 *
 * It speaks the real streaming protocol (server-sent events: message_start,
 * content_block_start / delta / stop, message_delta, message_stop), so the official
 * SDK parses it exactly as it would a live response. Each request is answered with the
 * next scripted turn, and every request body is recorded for assertions.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

export type MockBlock =
  | { type: "thinking" }
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

export type MockTurn =
  | { blocks: MockBlock[]; stopReason: "end_turn" | "tool_use" | "max_tokens" | "refusal" }
  | { httpError: number; message: string };

export interface RecordedRequest {
  url: string;
  headers: http.IncomingHttpHeaders;
  body: Record<string, any>;
}

const sse = (event: string, data: object) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

function render(turn: Extract<MockTurn, { blocks: unknown }>, n: number): string {
  let out = sse("message_start", {
    type: "message_start",
    message: {
      id: `msg_mock_${n}`, type: "message", role: "assistant", model: "claude-opus-5-5", content: [],
      stop_reason: null, stop_sequence: null,
      usage: { input_tokens: 1800, output_tokens: 1, cache_read_input_tokens: 1500, cache_creation_input_tokens: 0 },
    },
  });
  turn.blocks.forEach((block, index) => {
    if (block.type === "thinking") {
      out += sse("content_block_start", { type: "content_block_start", index, content_block: { type: "thinking", thinking: "", signature: "" } });
      out += sse("content_block_delta", { type: "content_block_delta", index, delta: { type: "signature_delta", signature: `sig_${n}_${index}` } });
    } else if (block.type === "text") {
      out += sse("content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } });
      for (const piece of block.text.match(/[\s\S]{1,12}/g) ?? []) {
        out += sse("content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: piece } });
      }
    } else {
      out += sse("content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } });
      out += sse("content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
    }
    out += sse("content_block_stop", { type: "content_block_stop", index });
  });
  out += sse("message_delta", { type: "message_delta", delta: { stop_reason: turn.stopReason, stop_sequence: null }, usage: { output_tokens: 64 } });
  out += sse("message_stop", { type: "message_stop" });
  return out;
}

export async function startMockAnthropic() {
  let script: MockTurn[] = [];
  const requests: RecordedRequest[] = [];

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      requests.push({ url: req.url ?? "", headers: req.headers, body });
      const turn = script.shift();
      if (!turn) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "mock script exhausted" } }));
        return;
      }
      if ("httpError" in turn) {
        res.writeHead(turn.httpError, { "content-type": "application/json" });
        res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: turn.message } }));
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      res.end(render(turn, requests.length));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    setScript(turns: MockTurn[]) {
      script = [...turns];
      requests.length = 0;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
