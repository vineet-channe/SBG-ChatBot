/**
 * POST /api/chat - runs one conversational turn and streams it back as NDJSON
 * (one JSON event per line), so the browser can render text, cards and trace events
 * as they happen.
 */
import { after } from "next/server";
import { handleTurn } from "@/lib/chat/orchestrator";
import type { ChatEvent, ChatRequest } from "@/lib/chat/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
    if (!body?.input) throw new Error("missing input");
  } catch {
    return Response.json({ error: "Expected { state, input }" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ChatEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // the browser went away; finish the turn quietly
        }
      };
      await handleTurn(body, emit, {
        defer: (task) => {
          try {
            after(task); // runs after the response finishes (e.g. the AI handoff summary)
          } catch {
            void task().catch(() => undefined);
          }
        },
      });
      try {
        controller.close();
      } catch {
        // already closed by a disconnect
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
