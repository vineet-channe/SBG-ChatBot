"use client";

import { useEffect, useRef } from "react";
import type { ChatInput } from "@/lib/chat/protocol";
import type { Intent } from "@/lib/engine/flow";
import type { Profile, ProfileField } from "@/lib/engine/profile";
import { SBG } from "@/lib/sbg/company";
import { Block } from "../blocks/Block";
import { CalculatorIcon, CheckIcon, CompassIcon, UserIcon } from "../ui/Icons";
import { SterlingMark } from "../ui/Logo";
import styles from "./chat.module.css";
import { Markdown } from "./Markdown";
import type { AssistantMessage, Message } from "./useChat";

interface Props {
  messages: Message[];
  profile: Profile;
  busy: boolean;
  onAnswer: (field: ProfileField, value: string | number, label: string) => void;
  onSend: (input: ChatInput, label?: string) => void;
  onIntent: (intent: Intent, label: string) => void;
  onText: (text: string) => void;
}

const INTENTS: { intent: Intent; title: string; hint: string; icon: React.ReactNode }[] = [
  { intent: "find", title: "Find the right financing", hint: "A few questions, then matches from SBG's programs", icon: <CompassIcon size={20} /> },
  { intent: "qualify", title: "See if I qualify", hint: "Check yourself against SBG's four published requirements", icon: <CheckIcon size={20} /> },
  { intent: "estimate", title: "Estimate my funding", hint: "Run SBG's calculator model on your numbers", icon: <CalculatorIcon size={20} /> },
  { intent: "existing", title: "I'm an existing customer", hint: "Balances, payoffs and renewals", icon: <UserIcon size={20} /> },
];

const EXAMPLES = [
  "I run a roofing company and need $80K for a dump truck",
  "Can I qualify with a 560 credit score?",
  "Term loan or line of credit for slow-season payroll?",
];

function Welcome({ busy, onIntent, onText }: Pick<Props, "busy" | "onIntent" | "onText">) {
  return (
    <div className={styles.welcome}>
      <span className={styles.eyebrow}>
        <SterlingMark size={22} /> Sterling · SBG Funding&apos;s AI guide
      </span>
      <h1 className={styles.headline}>What does your business need?</h1>
      <p className={styles.lede}>
        I&apos;ll match you with SBG&apos;s financing, check you against the published requirements and estimate what you
        could qualify for. It takes about two minutes and never touches your credit.
      </p>
      <div className={styles.intents}>
        {INTENTS.map((item) => (
          <button key={item.intent} className={styles.intent} onClick={() => onIntent(item.intent, item.title)} disabled={busy}>
            <span className={styles.intentIcon}>{item.icon}</span>
            <span className={styles.intentTitle}>{item.title}</span>
            <span className={styles.intentHint}>{item.hint}</span>
          </button>
        ))}
      </div>
      <div className={styles.examples}>
        <span className={styles.examplesLabel}>Or ask in your own words:</span>
        <div className={styles.exampleList}>
          {EXAMPLES.map((example) => (
            <button key={example} className={styles.example} onClick={() => onText(example)} disabled={busy}>
              {example}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.trust}>
        {SBG.stats.map((stat) => (
          <span key={stat.label} className={styles.trustItem}>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </span>
        ))}
        <p className={styles.human}>
          Rather talk to a person? Call <a href={SBG.phoneHref}>{SBG.phone}</a> or{" "}
          <button onClick={() => onIntent("human", "Talk to a specialist")} disabled={busy}>
            ask for a specialist
          </button>
          .
        </p>
      </div>
    </div>
  );
}

function AssistantTurn({ message, active, ...handlers }: { message: AssistantMessage; active: boolean } & Omit<Props, "messages" | "busy">) {
  const empty = !message.text && message.blocks.length === 0;
  return (
    <div className={styles.assistantRow}>
      <div className={styles.avatar}>
        <SterlingMark />
      </div>
      <div className={styles.body}>
        {message.text && (
          <div className={styles.text}>
            <Markdown text={message.text} sources={message.sources} />
          </div>
        )}
        {message.streaming && message.status && (
          <div className={styles.status} role="status">
            <span className={styles.statusText}>{message.status}</span>
          </div>
        )}
        {message.streaming && empty && !message.status && (
          <div className={styles.typing} aria-label="Sterling is typing">
            <span />
            <span />
            <span />
          </div>
        )}
        {message.blocks.map((block, i) => (
          <Block key={i} block={block} active={active} {...handlers} />
        ))}
        {message.sources.length > 0 && !message.streaming && (
          <div className={styles.sources} aria-label="Sources">
            {message.sources.map((s) => (
              <a key={s.n} className={styles.source} href={s.url} target="_blank" rel="noreferrer" title={s.snippet}>
                <span className={styles.sourceN}>{s.n}</span>
                <span className={styles.sourceTitle}>{s.title}</span>
              </a>
            ))}
          </div>
        )}
        {message.error && <div className={styles.error} role="alert">{message.error}</div>}
      </div>
    </div>
  );
}

export function Conversation({ messages, busy, ...handlers }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const count = useRef(0);

  // Stay pinned to the newest message unless the reader has scrolled up. Sending a new
  // message always brings the reader back down to the reply.
  useEffect(() => {
    const el = scroller.current;
    if (!el || messages.length === 0) return;
    if (messages.length > count.current) pinned.current = true;
    count.current = messages.length;
    if (pinned.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const lastId = messages.at(-1)?.id;
  return (
    <div className={styles.scroll} ref={scroller} onScroll={onScroll}>
      {messages.length === 0 ? (
        <Welcome busy={busy} onIntent={handlers.onIntent} onText={handlers.onText} />
      ) : (
        <div className={styles.thread}>
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className={styles.userRow}>
                <div className={styles.userBubble}>{m.text}</div>
              </div>
            ) : (
              <AssistantTurn key={m.id} message={m} active={m.id === lastId && !busy} {...handlers} />
            ),
          )}
        </div>
      )}
    </div>
  );
}
