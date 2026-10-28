"use client";

import type { ChatInput, UIBlock } from "@/lib/chat/protocol";
import type { Intent } from "@/lib/engine/flow";
import type { Profile, ProfileField } from "@/lib/engine/profile";
import { SBG } from "@/lib/sbg/company";
import { ExternalIcon, PhoneIcon, ShieldIcon } from "../ui/Icons";
import styles from "./blocks.module.css";
import { EstimateCard } from "./EstimateCard";
import { HandoffCard } from "./HandoffCard";
import { QuestionCard } from "./QuestionCard";
import { ResultsCard } from "./ResultsCard";

export interface BlockHandlers {
  profile: Profile;
  onAnswer: (field: ProfileField, value: string | number, label: string) => void;
  onSend: (input: ChatInput, label?: string) => void;
  onIntent: (intent: Intent, label: string) => void;
  onText: (text: string) => void;
}

const PII_LABELS: Record<string, string> = { ssn: "a Social Security number", card: "a card number", bank_account: "a bank account number" };

export function Block({ block, active, ...handlers }: { block: UIBlock; active: boolean } & BlockHandlers) {
  switch (block.kind) {
    case "question":
      return <QuestionCard question={block.question} active={active} onAnswer={handlers.onAnswer} />;
    case "results":
      return <ResultsCard result={block.result} profile={block.profile} onText={handlers.onText} onIntent={handlers.onIntent} />;
    case "estimate":
      return <EstimateCard profile={block.profile} />;
    case "handoff":
      return <HandoffCard block={block} />;
    case "existing_customer":
      return (
        <div className={styles.card}>
          <div className={styles.cardBody}>
            <div className={styles.eyebrow}>Existing customers</div>
            <h3 className={styles.title} style={{ marginTop: 4 }}>Your account, your Relationship Manager</h3>
            <p className={styles.muted} style={{ margin: "8px 0 0" }}>
              The customer portal shows your balance, payment history and renewal eligibility. Most clients can renew
              once they&apos;ve paid down 40-50% of their balance.
            </p>
            <div className={styles.actions}>
              <a className={styles.neon} href={SBG.urls.portal} target="_blank" rel="noreferrer">
                Open the customer portal <ExternalIcon size={16} />
              </a>
              <a className={styles.secondary} href={SBG.phoneHref}>
                <PhoneIcon size={16} /> {SBG.phone}
              </a>
            </div>
            <p className={styles.muted} style={{ margin: "10px 0 0" }}>
              Relationship Managers: {SBG.hours.label} · {block.hours.open ? "available now" : block.hours.label.toLowerCase()}
            </p>
          </div>
        </div>
      );
    case "pii_notice":
      return (
        <div className={styles.pii} role="note">
          <ShieldIcon size={22} />
          <span>
            For your security, I removed {block.kinds.map((k) => PII_LABELS[k] ?? "a sensitive number").join(" and ")} from this
            conversation. SBG never needs it in chat; the secure application collects what&apos;s required.
          </span>
        </div>
      );
    case "quick_replies":
      return (
        <div className={styles.replies}>
          {block.options.map((option) => (
            <button key={option.label} className={styles.reply} disabled={!active} onClick={() => handlers.onSend(option.input, option.label)}>
              {option.label}
            </button>
          ))}
        </div>
      );
  }
}
