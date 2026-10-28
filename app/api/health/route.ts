/** GET /api/health - what the assistant is running on (shown in the inspector). */
import { llmLabel } from "@/lib/agent/client";
import { hoursStatus } from "@/lib/engine/hours";
import { loadIndex } from "@/lib/rag/retriever";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let knowledgeBase: Record<string, unknown>;
  try {
    const { index } = loadIndex();
    knowledgeBase = { chunks: index.chunks.length, embeddingModel: index.model, builtAt: index.builtAt, source: index.sourcePdf };
  } catch {
    knowledgeBase = { error: "data/kb-index.json missing - run `npm run ingest`" };
  }
  return Response.json({ llm: llmLabel(), knowledgeBase, advisors: hoursStatus() });
}
