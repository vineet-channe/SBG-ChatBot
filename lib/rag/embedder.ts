/**
 * Sentence embeddings, computed locally.
 *
 * all-MiniLM-L6-v2 is a 6-layer BERT encoder fine-tuned so that texts with similar
 * meaning land close together. The pipeline below does what every sentence-embedding
 * model does:
 *   tokenize -> run the transformer -> mean-pool the token vectors -> L2-normalize
 * Normalizing means cosine similarity is just a dot product later on.
 *
 * Runs on ONNX Runtime in Node, so no API key and no network once `npm run setup`
 * has downloaded the model into ./models.
 */
import path from "node:path";

export const EMBEDDING_MODEL = "all-MiniLM-L6-v2";
export const EMBEDDING_DIMS = 384;

type Extractor = (
  texts: string | string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

// Survives Next.js dev-server hot reloads so the model is loaded only once.
const globalCache = globalThis as unknown as { __sterlingExtractor?: Promise<Extractor> };

async function loadExtractor(): Promise<Extractor> {
  const { pipeline, env } = await import("@huggingface/transformers");
  env.allowRemoteModels = false; // never reach out to the network at runtime
  env.localModelPath = path.join(process.cwd(), "models");
  const extractor = await pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "fp32" });
  return extractor as unknown as Extractor;
}

function getExtractor(): Promise<Extractor> {
  globalCache.__sterlingExtractor ??= loadExtractor().catch((err) => {
    globalCache.__sterlingExtractor = undefined; // allow a retry after e.g. `npm run setup`
    throw err;
  });
  return globalCache.__sterlingExtractor;
}

/** Embeds texts in small batches; returns one unit-length vector per text. */
export async function embed(texts: string[], batchSize = 16): Promise<number[][]> {
  const extractor = await getExtractor();
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const output = await extractor(texts.slice(i, i + batchSize), { pooling: "mean", normalize: true });
    vectors.push(...output.tolist());
  }
  return vectors;
}

export async function embedOne(text: string): Promise<number[]> {
  const [vector] = await embed([text]);
  return vector;
}

/** Dot product; equals cosine similarity because vectors are normalized. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}
