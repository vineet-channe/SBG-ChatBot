/**
 * Layout-aware PDF parsing.
 *
 * A PDF has no headings or paragraphs - just positioned runs of text. To chunk by
 * meaning we rebuild the structure from the layout:
 *   - font size tells us heading level (22pt section, 15pt sub-section, 10.5pt body),
 *   - "Source:" lines carry the citation URL,
 *   - vertical gaps and bullet markers split paragraphs and list items,
 *   - tiny text (page headers/footers) is dropped.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

export interface PdfLine {
  page: number;
  y: number;
  x: number;
  size: number;
  text: string;
}

export interface PdfSection {
  section: string;
  title: string;
  source: string;
  page: number;
  /** Paragraphs and list items, in reading order. */
  units: string[];
}

const SIZE = { h1: 20, h2: 14, h3: 11.6, chrome: 7.6 };

export async function readPdfLines(file: string): Promise<PdfLine[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile(file));
  const doc = await pdfjs.getDocument({
    data,
    verbosity: 0,
    standardFontDataUrl: path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts") + path.sep,
  }).promise;

  const lines: PdfLine[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const runs = (content.items as { str: string; transform: number[] }[])
      .filter((it) => it.str.trim().length > 0)
      .map((it) => ({ text: it.str, x: it.transform[4], y: it.transform[5], size: Math.abs(it.transform[3]) }));

    // Group runs that sit on the same baseline into one line, left to right.
    runs.sort((a, b) => b.y - a.y || a.x - b.x);
    for (const run of runs) {
      const line = lines.find((l) => l.page === p && Math.abs(l.y - run.y) < 1.5);
      if (line) {
        line.text = `${line.text}${line.text.endsWith(" ") || run.text.startsWith(" ") ? "" : " "}${run.text}`;
        line.size = Math.max(line.size, run.size);
        line.x = Math.min(line.x, run.x);
      } else {
        lines.push({ page: p, y: run.y, x: run.x, size: run.size, text: run.text });
      }
    }
  }
  return lines
    .map((l) => ({ ...l, text: l.text.replace(/\s+/g, " ").trim() }))
    .sort((a, b) => a.page - b.page || b.y - a.y);
}

/** Turns positioned lines into sections of paragraphs / list items. */
export function buildSections(lines: PdfLine[]): PdfSection[] {
  const sections: PdfSection[] = [];
  let h1 = "";
  let current: PdfSection | null = null;
  let unit = "";
  let prev: PdfLine | null = null;

  const flushUnit = () => {
    if (current && unit.trim()) current.units.push(unit.trim());
    unit = "";
  };

  let inBody = false;
  for (const line of lines) {
    if (line.size < SIZE.chrome) continue; // running header / footer
    // Everything before the first numbered section ("1. About SBG Funding") is the cover page.
    if (!inBody) {
      if (line.size >= SIZE.h1 && /^\d+\.\s/.test(line.text)) inBody = true;
      else continue;
    }
    const isBodyGap = prev && prev.page === line.page && prev.y - line.y > line.size * 1.55;

    if (line.size >= SIZE.h1) {
      flushUnit();
      h1 = line.text.replace(/^\d+\.\s*/, "");
      current = null;
    } else if (line.size >= SIZE.h2) {
      // A heading that wrapped onto a second line continues the previous title.
      if (prev && prev.size >= SIZE.h2 && prev.size < SIZE.h1 && current && current.units.length === 0 && !unit) {
        current.title += ` ${line.text}`;
      } else {
        flushUnit();
        current = { section: h1, title: line.text, source: "", page: line.page, units: [] };
        sections.push(current);
      }
    } else if (line.size >= SIZE.h3 && current) {
      flushUnit();
      current = { section: h1, title: `${current.title} - ${line.text}`, source: current.source, page: line.page, units: [] };
      sections.push(current);
    } else if (line.text.startsWith("Source:") && current) {
      current.source = line.text.replace(/^Source:\s*/, "");
    } else if (current && line.size < 9.5 && prev?.text.startsWith("Source:")) {
      current.source += line.text; // a long source URL wrapped onto a second line
    } else if (current) {
      const startsItem = /^(•|\d+\.)\s/.test(line.text);
      if (startsItem || isBodyGap || (prev && prev.page !== line.page && /^[A-Z]/.test(line.text) && /[.:]$/.test(unit))) {
        flushUnit();
      }
      const text = line.text.replace(/^•\s*/, "- ");
      // "year-" + "round" was one word that wrapped at its hyphen
      const joiner = !unit ? "" : unit.endsWith("-") && /^[a-z]/.test(text) ? "" : " ";
      unit += joiner + text;
    }
    prev = line;
  }
  flushUnit();
  return sections.filter((s) => s.units.length > 0);
}
