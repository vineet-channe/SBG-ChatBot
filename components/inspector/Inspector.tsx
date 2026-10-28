"use client";

import { useEffect, useState } from "react";
import type { TraceEvent } from "@/lib/chat/protocol";
import type { TurnTrace } from "../chat/useChat";
import { CloseIcon } from "../ui/Icons";
import styles from "./inspector.module.css";

interface Health {
  llm: string;
  knowledgeBase: { chunks?: number; embeddingModel?: string; source?: string; error?: string };
}

interface Hit {
  id: string;
  title?: string;
  dense: number;
  bm25: number;
  rrf?: number;
}

function EventRow({ event }: { event: TraceEvent }) {
  const data = event.data as { hits?: Hit[] } | undefined;
  return (
    <li className={styles.event}>
      <span className={styles.time}>+{event.t}ms</span>
      <span className={styles.type} data-type={event.type}>{event.type}</span>
      <span className={styles.label}>{event.label}</span>
      {event.type === "retrieval" && data?.hits ? (
        <table className={styles.hits}>
          <thead>
            <tr><th>passage</th><th>cosine</th><th>bm25</th><th>rrf</th></tr>
          </thead>
          <tbody>
            {data.hits.map((h) => (
              <tr key={h.id}>
                <td title={h.title ?? h.id}>{h.title ?? h.id}</td>
                <td>{h.dense.toFixed(3)}</td>
                <td>{h.bm25.toFixed(2)}</td>
                <td>{h.rrf !== undefined ? h.rrf.toFixed(4) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : event.data !== undefined ? (
        <details className={styles.details}>
          <summary>details</summary>
          <pre className={styles.json}>{JSON.stringify(event.data, null, 2)}</pre>
        </details>
      ) : null}
    </li>
  );
}

export function Inspector({ open, traces, onClose }: { open: boolean; traces: TurnTrace[]; onClose: () => void }) {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => setHealth(null));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div className={styles.scrim} data-open={open} onClick={onClose} aria-hidden="true" />
      <aside className={styles.drawer} data-open={open} aria-label="Under the hood" aria-hidden={!open} inert={!open}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Under the hood</h2>
            <p className={styles.sub}>How each message was handled: guardrails, the guided flow, tool calls, retrieval and the model.</p>
          </div>
          <button className={styles.close} onClick={onClose} aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>
        <div className={styles.body}>
          <dl className={styles.system}>
            <div className={styles.stat}>
              <dt>Language model</dt>
              <dd>{health?.llm ?? "…"}</dd>
            </div>
            <div className={styles.stat}>
              <dt>Knowledge base</dt>
              <dd>
                {health?.knowledgeBase.chunks !== undefined
                  ? `${health.knowledgeBase.chunks} passages · ${health.knowledgeBase.source}`
                  : health?.knowledgeBase.error ?? "…"}
              </dd>
            </div>
            <div className={styles.stat}>
              <dt>Embeddings</dt>
              <dd>{health?.knowledgeBase.embeddingModel ?? "…"} (local, 384-d)</dd>
            </div>
            <div className={styles.stat}>
              <dt>Retrieval</dt>
              <dd>hybrid: cosine + BM25, rank fusion</dd>
            </div>
          </dl>

          {traces.length === 0 ? (
            <div className={styles.empty}>Send a message and its trace appears here, newest first.</div>
          ) : (
            traces.map((turn) => {
              const total = turn.events.at(-1)?.t;
              return (
                <section key={turn.id} className={styles.turn}>
                  <div className={styles.turnHead}>
                    <strong title={turn.label}>{turn.label}</strong>
                    <span>{total !== undefined ? `${total}ms` : "running"}</span>
                  </div>
                  <ol className={styles.events}>
                    {turn.events.map((event, i) => <EventRow key={i} event={event} />)}
                  </ol>
                </section>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}
