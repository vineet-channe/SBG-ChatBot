/**
 * A deliberately small Markdown renderer for assistant replies: paragraphs, bullet and
 * numbered lists, **bold**, links and [n] citation markers. It builds React elements
 * (no innerHTML), so nothing in a reply can inject markup.
 */
import type { ReactNode } from "react";
import type { Source } from "@/lib/chat/protocol";
import styles from "./chat.module.css";

const INLINE = /(\*\*[^*\n]+\*\*|(?:\[\d+\])+|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s)]+[^\s).,;:!?])/g;

function inline(text: string, sources: Source[], key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const k = `${key}-${i++}`;
    if (token.startsWith("**")) {
      out.push(<strong key={k}>{token.slice(2, -2)}</strong>);
    } else if (/^(\[\d+\])+$/.test(token)) {
      for (const n of token.match(/\d+/g) ?? []) {
        const source = sources.find((s) => s.n === Number(n));
        out.push(
          source ? (
            <a key={`${k}-${n}`} className={styles.cite} href={source.url} target="_blank" rel="noreferrer" title={source.title}>
              {n}
            </a>
          ) : (
            <span key={`${k}-${n}`} className={styles.cite}>{n}</span>
          ),
        );
      }
    } else if (token.startsWith("[")) {
      const [, label, href] = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/) ?? [];
      out.push(<a key={k} href={href} target="_blank" rel="noreferrer">{label}</a>);
    } else {
      out.push(<a key={k} href={token} target="_blank" rel="noreferrer">{token.replace(/^https?:\/\//, "")}</a>);
    }
    last = start + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, sources = [] }: { text: string; sources?: Source[] }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/).filter((b) => b.trim());
  return (
    <>
      {blocks.map((block, b) => {
        const lines = block.split("\n").filter((l) => l.trim());
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
          return (
            <ul key={b}>
              {lines.map((l, i) => <li key={i}>{inline(l.replace(/^\s*[-*•]\s+/, ""), sources, `${b}-${i}`)}</li>)}
            </ul>
          );
        }
        if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
          return (
            <ol key={b}>
              {lines.map((l, i) => <li key={i}>{inline(l.replace(/^\s*\d+[.)]\s+/, ""), sources, `${b}-${i}`)}</li>)}
            </ol>
          );
        }
        // A heading-ish lead line followed by a list
        const firstList = lines.findIndex((l) => /^\s*[-*•]\s+/.test(l));
        if (firstList > 0 && lines.slice(firstList).every((l) => /^\s*[-*•]\s+/.test(l))) {
          return (
            <div key={b}>
              <p>{inline(lines.slice(0, firstList).join(" "), sources, `${b}-p`)}</p>
              <ul>
                {lines.slice(firstList).map((l, i) => <li key={i}>{inline(l.replace(/^\s*[-*•]\s+/, ""), sources, `${b}-${i}`)}</li>)}
              </ul>
            </div>
          );
        }
        return <p key={b}>{inline(lines.join(" ").replace(/^#+\s*/, ""), sources, `${b}`)}</p>;
      })}
    </>
  );
}
