/**
 * Runs once when the Next.js server starts: load the knowledge index and the embedding
 * model up front so the first visitor's question doesn't pay the ~1-2s model load.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { warmUp } = await import("./lib/rag/retriever");
    await warmUp();
  } catch (err) {
    console.warn("[sterling] Retrieval warm-up skipped:", err instanceof Error ? err.message : err);
  }
}
