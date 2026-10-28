"use client";

import { useState } from "react";
import type { UIBlock } from "@/lib/chat/protocol";
import { SBG } from "@/lib/sbg/company";
import { CheckIcon, CopyIcon, PhoneIcon, UserIcon } from "../ui/Icons";
import styles from "./blocks.module.css";

type HandoffBlock = Extract<UIBlock, { kind: "handoff" }>;

export function HandoffCard({ block }: { block: HandoffBlock }) {
  const [mode, setMode] = useState<"idle" | "form" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", bestTime: "Anytime", message: "" });
  const { hours } = block;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMode("sending");
    setError(null);
    try {
      const res = await fetch("/api/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: block.ticketId, contact: form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't send the request");
      setMode("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the request");
      setMode("form");
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(block.ticketId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <section className={`${styles.card} ${styles.handoff}`} aria-label="Talk to a funding specialist">
      <div className={styles.cardBody}>
        <div className={styles.handoffHead}>
          <span className={styles.handoffAvatar}><UserIcon size={22} /></span>
          <h3 className={styles.title}>
            A funding specialist will take it from here
            {block.priority === "high" && <span className={styles.priority}>Priority</span>}
          </h3>
          <span className={styles.statusPill} data-open={hours.open}>{hours.label}</span>
        </div>

        <div className={styles.reference}>
          Reference <code>{block.ticketId}</code>
          <button className={styles.copy} onClick={copy} aria-label="Copy reference">
            {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
          </button>
        </div>
        <p className={styles.muted} style={{ margin: "4px 0 0" }}>
          Your advisor sees this conversation and your funding file, so you won&apos;t have to repeat anything. Mention the
          reference if you call.
        </p>

        {mode !== "sent" && (
          <div className={styles.actions}>
            <a className={hours.open ? styles.neon : styles.secondary} href={SBG.phoneHref}>
              <PhoneIcon size={16} /> Call {SBG.phone}
            </a>
            {mode === "idle" && (
              <button className={hours.open ? styles.secondary : styles.neon} onClick={() => setMode("form")}>
                Request a callback
              </button>
            )}
          </div>
        )}

        {(mode === "form" || mode === "sending") && (
          <form className={styles.form} onSubmit={submit}>
            <div className={styles.formRow}>
              <label className={styles.field}>
                Your name
                <input required autoComplete="name" value={form.name} onChange={update("name")} />
              </label>
              <label className={styles.field}>
                Phone
                <input required type="tel" autoComplete="tel" value={form.phone} onChange={update("phone")} />
              </label>
            </div>
            <div className={styles.formRow}>
              <label className={styles.field}>
                Email (optional)
                <input type="email" autoComplete="email" value={form.email} onChange={update("email")} />
              </label>
              <label className={styles.field}>
                Best time to call
                <select value={form.bestTime} onChange={update("bestTime")}>
                  <option>Anytime</option>
                  <option>Morning</option>
                  <option>Afternoon</option>
                  <option>Evening</option>
                </select>
              </label>
            </div>
            <label className={styles.field}>
              Anything we should know? (optional)
              <textarea maxLength={500} value={form.message} onChange={update("message")} />
            </label>
            {error && <div className={styles.formError} role="alert">{error}</div>}
            <div>
              <button className={styles.neon} type="submit" disabled={mode === "sending"}>
                {mode === "sending" ? "Sending…" : "Request callback"}
              </button>
            </div>
          </form>
        )}

        {mode === "sent" && (
          <div className={styles.sent} role="status">
            <CheckIcon size={22} />
            <span>
              Callback requested. {hours.open ? "An advisor will call you shortly." : `The team is offline right now; expect a call ${hours.label.replace(/^Back /, "")}.`}{" "}
              Your reference is {block.ticketId}.
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
