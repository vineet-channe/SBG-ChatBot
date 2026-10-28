/**
 * Retrieval building blocks that don't need the embedding model: tokenization and BM25.
 * (End-to-end retrieval quality is measured by `npm run eval`.)
 */
import { describe, expect, it } from "vitest";
import { BM25, tokenize } from "@/lib/rag/bm25";

describe("tokenize", () => {
  it("normalizes SBA 7(a) and drops stopwords", () => {
    expect(tokenize("What is an SBA 7(a) loan?")).toEqual(["sba", "7a", "loan"]);
  });

  it("keeps numbers, dollar signs and percentages", () => {
    expect(tokenize("Call 844-284-2725 about 90% of $500K")).toEqual(["call", "844", "284", "2725", "90%", "$500k"]);
  });

  it("stems plurals and strips apostrophes", () => {
    expect(tokenize("companies' invoices aren't paid")).toEqual(["company", "invoice", "arent", "paid"]);
  });
});

describe("BM25", () => {
  const docs = [
    "SBA 7(a) loans take 30 to 90 days and need more paperwork.",
    "A line of credit lets you draw funds, repay and draw again.",
    "Invoice financing advances up to 90% of unpaid invoices.",
  ];
  const bm25 = new BM25(docs);
  const best = (query: string) => {
    const scores = bm25.score(query);
    return scores.indexOf(Math.max(...scores));
  };

  it("ranks the passage with the query's rare terms first", () => {
    expect(best("How does 7(a) work?")).toBe(0);
    expect(best("draw again")).toBe(1);
    expect(best("unpaid invoices")).toBe(2);
  });

  it("scores zero when no query term appears", () => {
    expect(bm25.score("restaurant renovation")).toEqual([0, 0, 0]);
  });
});
