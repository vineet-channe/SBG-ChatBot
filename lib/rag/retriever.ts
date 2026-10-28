/**
 * Hybrid retrieval: dense (embeddings) + sparse (BM25), merged with Reciprocal Rank Fusion.
 *
 * RRF ignores raw scores (cosine and BM25 live on different scales) and uses ranks:
 *   rrf(d) = sum over rankers r of w_r / (K + rank_r(d)),  K = 60
 * A passage that both rankers like rises to the top; one that only one ranker likes
 * still makes the list. The dense cosine of the best hit doubles as a confidence
 * signal: when nothing is close, Sterling says so and offers a human instead of guessing.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { BM25 } from "./bm25";
import { cosine, embedOne } from "./embedder";
import type { Chunk, KnowledgeIndex } from "./types";

export type SearchMode = "hybrid" | "dense" | "bm25";

export interface SearchHit {
  chunk: Chunk;
  /** Cosine similarity, 0-1 in practice. */
  dense: number;
  bm25: number;
  rrf: number;
  denseRank: number;
  bm25Rank: number;
}

export interface SearchResult {
  query: string;
  mode: SearchMode;
  hits: SearchHit[];
  /** How sure we are the knowledge base covers the question. */
  confidence: "high" | "medium" | "low";
  ms: number;
}

const RRF_K = 60;
const CANDIDATES = 20;
/** Fusion weights; dense carries more weight because BM25 is noisier on conversational questions. */
export const FUSION_WEIGHTS = { dense: 1, bm25: 0.6 };
// Calibrated on evals/retrieval.json: answerable questions almost always have a best
// dense match above 0.45; off-topic questions rarely exceed 0.30.
export const CONFIDENCE = { high: 0.5, medium: 0.33 };

interface LoadedIndex {
  index: KnowledgeIndex;
  vectors: Float32Array[];
  bm25: BM25;
}

const cache = globalThis as unknown as { __sterlingIndex?: LoadedIndex };

export function loadIndex(): LoadedIndex {
  if (!cache.__sterlingIndex) {
    const file = path.join(process.cwd(), "data", "kb-index.json");
    const index = JSON.parse(readFileSync(file, "utf8")) as KnowledgeIndex;
    cache.__sterlingIndex = {
      index,
      vectors: index.chunks.map((c) => Float32Array.from(c.embedding)),
      // Title + passage only: the broad section name ("Costs, payments and estimates")
      // would make every chunk in a section match words like "cost".
      bm25: new BM25(index.chunks.map((c) => `${c.title}\n${c.text}`)),
    };
  }
  return cache.__sterlingIndex;
}

function ranks(scores: number[]): number[] {
  const order = scores.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0]);
  const rank = new Array<number>(scores.length);
  order.forEach(([, i], r) => (rank[i] = r + 1));
  return rank;
}

export async function search(
  query: string,
  opts: { k?: number; mode?: SearchMode; weights?: { dense: number; bm25: number } } = {},
): Promise<SearchResult> {
  const started = performance.now();
  const k = opts.k ?? 5;
  const mode = opts.mode ?? "hybrid";
  const weights = opts.weights ?? FUSION_WEIGHTS;
  const { index, vectors, bm25 } = loadIndex();

  const queryVector = mode === "bm25" ? null : await embedOne(query);
  const dense = queryVector ? vectors.map((v) => cosine(queryVector, v)) : vectors.map(() => 0);
  const lexical = mode === "dense" ? vectors.map(() => 0) : bm25.score(query);
  const denseRank = ranks(dense);
  const bm25Rank = ranks(lexical);

  const fused = index.chunks.map((chunk, i) => {
    let rrf = 0;
    if (mode !== "bm25" && denseRank[i] <= CANDIDATES) rrf += weights.dense / (RRF_K + denseRank[i]);
    if (mode !== "dense" && bm25Rank[i] <= CANDIDATES && lexical[i] > 0) rrf += weights.bm25 / (RRF_K + bm25Rank[i]);
    const { embedding: _embedding, ...rest } = chunk;
    return { chunk: rest as Chunk, dense: dense[i], bm25: lexical[i], rrf, denseRank: denseRank[i], bm25Rank: bm25Rank[i] };
  });

  const hits = fused.filter((h) => h.rrf > 0).sort((a, b) => b.rrf - a.rrf).slice(0, k);
  const best = Math.max(0, ...dense);
  const confidence = mode === "bm25"
    ? (hits[0]?.bm25 ?? 0) > 6 ? "high" : (hits[0]?.bm25 ?? 0) > 3 ? "medium" : "low"
    : best >= CONFIDENCE.high ? "high" : best >= CONFIDENCE.medium ? "medium" : "low";

  return { query, mode, hits, confidence, ms: Math.round(performance.now() - started) };
}
