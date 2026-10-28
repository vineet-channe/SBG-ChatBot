/**
 * Ingestion pipeline (offline step of RAG):
 *
 *   knowledge/sbg-knowledge-base.pdf
 *     -> parse the PDF layout into sections        (lib/rag/pdf.ts)
 *     -> split sections into passages               (lib/rag/chunker.ts)
 *     -> embed each passage with MiniLM             (lib/rag/embedder.ts)
 *     -> write data/kb-index.json                   (read by lib/rag/retriever.ts)
 *
 * Re-run whenever the PDF changes: npm run ingest
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chunkSections, embeddingText, MAX_WORDS } from "../lib/rag/chunker";
import { EMBEDDING_DIMS, EMBEDDING_MODEL, embed } from "../lib/rag/embedder";
import { buildSections, readPdfLines } from "../lib/rag/pdf";
import type { KnowledgeIndex } from "../lib/rag/types";

const PDF = path.join(process.cwd(), "knowledge", "sbg-knowledge-base.pdf");
const OUT = path.join(process.cwd(), "data", "kb-index.json");

async function main() {
  const started = Date.now();
  const lines = await readPdfLines(PDF);
  const sections = buildSections(lines);
  const chunks = chunkSections(sections);
  console.log(`Parsed ${lines.length} lines -> ${sections.length} sections -> ${chunks.length} chunks`);

  const vectors = await embed(chunks.map(embeddingText));
  const index: KnowledgeIndex = {
    model: EMBEDDING_MODEL,
    dims: EMBEDDING_DIMS,
    builtAt: new Date().toISOString(),
    sourcePdf: path.relative(process.cwd(), PDF),
    chunking: { maxWords: MAX_WORDS, overlap: "last list item / paragraph (<= 40 words) repeated across a split" },
    chunks: chunks.map((chunk, i) => ({
      ...chunk,
      // 5 decimals is plenty for cosine similarity and keeps the file small.
      embedding: vectors[i].map((v) => Math.round(v * 1e5) / 1e5),
    })),
  };

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(index));

  const sizes = chunks.map((c) => c.wordCount).sort((a, b) => a - b);
  console.log(`Chunk size (words): min ${sizes[0]}, median ${sizes[Math.floor(sizes.length / 2)]}, max ${sizes[sizes.length - 1]}`);
  console.log(`Wrote ${path.relative(process.cwd(), OUT)} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
