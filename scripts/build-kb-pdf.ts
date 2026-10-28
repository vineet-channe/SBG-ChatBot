/**
 * Compiles knowledge/source/*.md into knowledge/sbg-knowledge-base.pdf - the
 * "company PDF" the assistant is grounded on. In a real deployment this PDF (or a
 * folder of them) would come from SBG's product and compliance teams; here it is
 * compiled from SBG Funding's public website.
 *
 * Supported markdown: # / ## / ### headings, "Source: <url>" lines, paragraphs,
 * "- " bullets, "1. " steps and "| a | b |" tables (rendered row by row so each
 * row stays a self-contained sentence for retrieval).
 *
 * Usage: npm run kb:pdf
 */
import { createWriteStream } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";

const SOURCE_DIR = path.join(process.cwd(), "knowledge", "source");
const OUTPUT = path.join(process.cwd(), "knowledge", "sbg-knowledge-base.pdf");

// Font sizes double as structure markers: scripts/ingest.ts recovers headings from them.
export const PDF_STYLE = {
  h1: 22,
  h2: 15,
  h3: 12,
  body: 10.5,
  source: 8.5,
  chrome: 7, // running header/footer, ignored by ingestion
} as const;

const COLORS = {
  navy: "#002B60",
  blue: "#0056C1",
  ink: "#1B2433",
  muted: "#616F91",
  neon: "#DEE70E",
  rule: "#C4CEDE",
};

type Block =
  | { kind: "h1" | "h2" | "h3" | "source" | "paragraph"; text: string }
  | { kind: "bullet" | "step"; text: string; marker: string }
  | { kind: "table"; header: string[]; rows: string[][] };

function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { flush(); continue; }
    if (line.startsWith("### ")) { flush(); blocks.push({ kind: "h3", text: line.slice(4) }); continue; }
    if (line.startsWith("## ")) { flush(); blocks.push({ kind: "h2", text: line.slice(3) }); continue; }
    if (line.startsWith("# ")) { flush(); blocks.push({ kind: "h1", text: line.slice(2) }); continue; }
    if (line.startsWith("Source:")) { flush(); blocks.push({ kind: "source", text: line }); continue; }
    if (line.startsWith("- ")) { flush(); blocks.push({ kind: "bullet", text: line.slice(2), marker: "•" }); continue; }
    const step = line.match(/^(\d+)\.\s+(.*)$/);
    if (step) { flush(); blocks.push({ kind: "step", text: step[2], marker: `${step[1]}.` }); continue; }
    if (line.startsWith("|")) {
      flush();
      const cells = (row: string) => row.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const header = cells(line);
      const rows: string[][] = [];
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith("|")) rows.push(cells(lines[++i].trim()));
      blocks.push({ kind: "table", header, rows });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

async function main() {
  const files = (await readdir(SOURCE_DIR)).filter((f) => f.endsWith(".md")).sort();
  const blocks: Block[] = [];
  for (const file of files) blocks.push(...parseMarkdown(await readFile(path.join(SOURCE_DIR, file), "utf8")));

  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 72, bottom: 64, left: 64, right: 64 },
    bufferPages: true,
    info: {
      Title: "SBG Funding Knowledge Pack",
      Subject: "Products, eligibility, policies and FAQs",
      Author: "Compiled from sbgfunding.com for the Sterling assistant prototype",
    },
  });
  doc.pipe(createWriteStream(OUTPUT));
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left = doc.page.margins.left;

  // Cover page
  doc.rect(0, 0, doc.page.width, 10).fill(COLORS.neon);
  doc.rect(0, 10, doc.page.width, 230).fill(COLORS.navy);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(30).text("SBG Funding", left, 96);
  doc.font("Helvetica").fontSize(18).fillColor("#C9DBFF").text("Knowledge Pack: products, eligibility and policies", left, 138);
  doc.fillColor(COLORS.ink).font("Helvetica").fontSize(11).text(
    "This document consolidates SBG Funding's published product terms, qualification requirements, " +
      "application process, industry guidance and frequently asked questions. It is the grounding source " +
      "for Sterling, the funding-guide assistant: answers are retrieved from these pages and cited.",
    left, 290, { width, lineGap: 3 },
  );
  doc.moveDown(1.2).font("Helvetica-Bold").fontSize(11).fillColor(COLORS.navy).text("Contents");
  doc.font("Helvetica").fontSize(10.5).fillColor(COLORS.ink);
  blocks.filter((b) => b.kind === "h1").forEach((b, i) => doc.text(`${i + 1}.  ${(b as { text: string }).text}`, { lineGap: 2 }));
  doc.moveDown(1.5).fontSize(8.5).fillColor(COLORS.muted).text(
    "Compiled October 2026 from public pages on sbgfunding.com and third-party review summaries. " +
      "Unofficial prototype material - SBG's live website and signed agreements take precedence.",
    { width, lineGap: 2 },
  );

  let section = 0;
  for (const block of blocks) {
    switch (block.kind) {
      case "h1":
        doc.addPage();
        section++;
        doc.font("Helvetica-Bold").fontSize(PDF_STYLE.h1).fillColor(COLORS.navy).text(`${section}. ${block.text}`, left, doc.page.margins.top);
        doc.moveTo(left, doc.y + 4).lineTo(left + 56, doc.y + 4).lineWidth(3).strokeColor(COLORS.neon).stroke();
        doc.moveDown(1.1);
        break;
      case "h2":
        if (doc.y > doc.page.height - doc.page.margins.bottom - 110) doc.addPage();
        doc.moveDown(0.6).font("Helvetica-Bold").fontSize(PDF_STYLE.h2).fillColor(COLORS.blue).text(block.text, left, doc.y, { width });
        doc.moveDown(0.15);
        break;
      case "h3":
        doc.moveDown(0.3).font("Helvetica-Bold").fontSize(PDF_STYLE.h3).fillColor(COLORS.navy).text(block.text, left, doc.y, { width });
        break;
      case "source":
        doc.font("Helvetica-Oblique").fontSize(PDF_STYLE.source).fillColor(COLORS.muted).text(block.text, left, doc.y, { width });
        doc.moveDown(0.45);
        break;
      case "paragraph":
        doc.font("Helvetica").fontSize(PDF_STYLE.body).fillColor(COLORS.ink).text(block.text, left, doc.y, { width, lineGap: 2.5 });
        doc.moveDown(0.55);
        break;
      case "bullet":
      case "step": {
        // Keep the marker and the first lines of the item on the same page.
        doc.font("Helvetica").fontSize(PDF_STYLE.body);
        const needed = Math.min(doc.heightOfString(block.text, { width: width - 20, lineGap: 2.5 }), 44);
        if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
        const y = doc.y;
        doc.fillColor(COLORS.blue).text(block.marker, left + 4, y, { width: 14 });
        doc.fillColor(COLORS.ink).text(block.text, left + 20, y, { width: width - 20, lineGap: 2.5 });
        doc.moveDown(0.25);
        break;
      }
      case "table":
        // One self-contained sentence per row, e.g. "Decision time - SBG Funding: Same day; Traditional bank: ..."
        for (const row of block.rows) {
          const [lead, ...rest] = row;
          const detail = rest.map((cell, i) => `${block.header[i + 1]}: ${cell}`).join("; ");
          doc.font("Helvetica").fontSize(PDF_STYLE.body);
          if (doc.y + 30 > doc.page.height - doc.page.margins.bottom) doc.addPage();
          doc.font("Helvetica-Bold").fontSize(PDF_STYLE.body).fillColor(COLORS.navy)
            .text(`${lead} - `, left, doc.y, { width, continued: true, lineGap: 2.5 });
          doc.font("Helvetica").fillColor(COLORS.ink).text(`${detail}.`, { lineGap: 2.5 });
          doc.moveDown(0.35);
        }
        doc.moveDown(0.3);
        break;
    }
  }

  // Running header and footer on every page after the cover.
  const range = doc.bufferedPageRange();
  for (let i = 1; i < range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // writing inside the margin must not trigger a page break
    doc.font("Helvetica").fontSize(PDF_STYLE.chrome).fillColor(COLORS.muted);
    doc.text("SBG Funding Knowledge Pack", left, 36, { width, align: "left" });
    doc.text(`Page ${i + 1} of ${range.count}`, left, doc.page.height - 40, { width, align: "right" });
    doc.page.margins.bottom = bottom;
  }

  doc.end();
  console.log(`Wrote ${path.relative(process.cwd(), OUTPUT)} (${range.count} pages from ${files.length} source files).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
