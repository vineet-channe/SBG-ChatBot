/** A retrievable passage of the knowledge base. */
export interface Chunk {
  id: string;
  /** Top-level PDF section, e.g. "Financing products". */
  section: string;
  /** Sub-section heading, e.g. "Business line of credit". */
  title: string;
  /** The passage itself (what the model reads and the UI quotes). */
  text: string;
  /** Public page the passage came from, shown as the citation link. */
  source: string;
  page: number;
  wordCount: number;
}

export interface IndexedChunk extends Chunk {
  embedding: number[];
}

/** data/kb-index.json - produced by `npm run ingest`, read at runtime. */
export interface KnowledgeIndex {
  model: string;
  dims: number;
  builtAt: string;
  sourcePdf: string;
  chunking: { maxWords: number; overlap: string };
  chunks: IndexedChunk[];
}
