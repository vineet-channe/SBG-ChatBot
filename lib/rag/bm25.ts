/**
 * BM25 keyword search - the "lexical" half of hybrid retrieval.
 *
 * Embeddings are great at meaning ("I can't make payroll" ~ "cover payroll gaps") but
 * fuzzy on exact tokens like "SBA 7(a)", "UCC", "HELOC" or "844-284-2725". BM25 scores
 * documents by how often the query's words appear in them, discounted for words that
 * appear everywhere (IDF) and for long documents (length normalization):
 *
 *   score(D, Q) = sum over terms t in Q of
 *     IDF(t) * tf(t, D) * (k1 + 1) / (tf(t, D) + k1 * (1 - b + b * |D| / avgdl))
 */

const STOPWORDS = new Set(
  ("a an and are as at be but by can do does for from has have how i if in into is it its me my of on or our " +
    "so that the their them then there these they this to up us was we what when where which who why will with " +
    "you your yours am been being did get got just than too very would should could about any all also much many")
    .split(" "),
);

/** Lowercase, keep $ / % / digits, normalize "7(a)" -> "7a", drop stopwords, light stemming. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/7\s*\(\s*a\s*\)/g, " 7a ")
    .replace(/[’']/g, "")
    .split(/[^a-z0-9$%]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

function stem(t: string): string {
  if (t.length <= 4 || /\d/.test(t)) return t;
  if (t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.endsWith("ing") && t.length > 6) return t.slice(0, -3);
  if (t.endsWith("ed") && t.length > 5) return t.slice(0, -2);
  if (t.endsWith("es") && /(ss|x|ch|sh)es$/.test(t)) return t.slice(0, -2);
  if (t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

export class BM25 {
  private readonly docs: Map<string, number>[];
  private readonly lengths: number[];
  private readonly avgLength: number;
  private readonly idf = new Map<string, number>();

  constructor(texts: string[], private readonly k1 = 1.2, private readonly b = 0.75) {
    this.docs = texts.map((text) => {
      const tf = new Map<string, number>();
      for (const token of tokenize(text)) tf.set(token, (tf.get(token) ?? 0) + 1);
      return tf;
    });
    this.lengths = this.docs.map((tf) => [...tf.values()].reduce((a, n) => a + n, 0));
    this.avgLength = this.lengths.reduce((a, n) => a + n, 0) / Math.max(1, this.lengths.length);

    const df = new Map<string, number>();
    for (const tf of this.docs) for (const term of tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);
    const n = this.docs.length;
    for (const [term, count] of df) this.idf.set(term, Math.log(1 + (n - count + 0.5) / (count + 0.5)));
  }

  /** One score per document, in the original order. */
  score(query: string): number[] {
    const terms = [...new Set(tokenize(query))];
    return this.docs.map((tf, i) => {
      let score = 0;
      for (const term of terms) {
        const f = tf.get(term);
        if (!f) continue;
        const norm = f + this.k1 * (1 - this.b + (this.b * this.lengths[i]) / this.avgLength);
        score += (this.idf.get(term) ?? 0) * ((f * (this.k1 + 1)) / norm);
      }
      return score;
    });
  }
}
