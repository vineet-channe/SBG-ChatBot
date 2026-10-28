/**
 * Structure-aware chunking.
 *
 * Each sub-section of the PDF (one product, one FAQ, one industry) is a natural unit
 * of meaning, so chunks never cross a heading. Inside a section, paragraphs and list
 * items are packed into chunks of up to MAX_WORDS words (small enough for the 256-token
 * embedding window, big enough to answer a question on their own). When a section has
 * to be split, the last item of the previous chunk is repeated at the start of the
 * next one (overlap), so a fact near the boundary keeps its context.
 */
import type { Chunk } from "./types";
import type { PdfSection } from "./pdf";

export const MAX_WORDS = 150;
const OVERLAP_MAX_WORDS = 40;

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

function splitLongUnit(unit: string): string[] {
  if (words(unit) <= MAX_WORDS) return [unit];
  const sentences = unit.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [unit];
  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && words(current) + words(sentence) > MAX_WORDS) {
      parts.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

export function chunkSections(sections: PdfSection[]): Chunk[] {
  const chunks: Chunk[] = [];
  const seen = new Map<string, number>();

  for (const section of sections) {
    const units = section.units.flatMap(splitLongUnit);
    const groups: string[][] = [];
    let group: string[] = [];
    for (const unit of units) {
      if (group.length && words(group.join(" ")) + words(unit) > MAX_WORDS) {
        groups.push(group);
        const last = group[group.length - 1];
        group = words(last) <= OVERLAP_MAX_WORDS ? [last] : [];
      }
      group.push(unit);
    }
    if (group.length) groups.push(group);

    for (const g of groups) {
      const base = slug(section.title);
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const text = g.join("\n");
      chunks.push({
        id: n === 1 ? base : `${base}-${n}`,
        section: section.section,
        title: section.title,
        text,
        source: section.source || "https://sbgfunding.com/",
        page: section.page,
        wordCount: words(text),
      });
    }
  }
  return chunks;
}

/**
 * What actually gets embedded: the passage prefixed with where it lives
 * ("Financing products > Business line of credit"). This "contextual header" lets a
 * chunk that just says "Limit: $5K - $500K" still match "line of credit limit".
 */
export function embeddingText(chunk: Chunk): string {
  return `${chunk.section} > ${chunk.title}\n${chunk.text}`;
}
