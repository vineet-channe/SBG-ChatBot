"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatInput } from "@/lib/chat/protocol";
import type { Intent } from "@/lib/engine/flow";
import { progress } from "@/lib/engine/flow";
import type { ProfileField } from "@/lib/engine/profile";
import { applyUrl } from "@/lib/sbg/company";
import styles from "./assistant.module.css";
import { Composer } from "./chat/Composer";
import { Conversation } from "./chat/Conversation";
import { Progress } from "./chat/Progress";
import { useChat } from "./chat/useChat";
import { useSpeechOutput } from "./chat/voice";
import { FundingFile } from "./file/FundingFile";
import { Inspector } from "./inspector/Inspector";
import { FileIcon, LayersIcon, PhoneIcon } from "./ui/Icons";
import { Logo } from "./ui/Logo";

/** Faint orbit arcs, echoing the curves on SBG's homepage hero. */
function Backdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <svg className={styles.arcs} viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <g fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1.2">
          <circle cx="1180" cy="-80" r="620" />
          <circle cx="1180" cy="-80" r="820" />
          <circle cx="160" cy="1040" r="520" />
          <circle cx="160" cy="1040" r="760" stroke="rgba(255,255,255,0.07)" />
        </g>
      </svg>
    </div>
  );
}

export default function Assistant() {
  const chat = useChat();
  const speech = useSpeechOutput();
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const spoken = useRef<string | null>(null);
  const { send } = chat;

  const sendInput = useCallback((input: ChatInput, label?: string) => {
    speech.stop();
    void send(input, label);
  }, [send, speech]);
  const sendText = useCallback((text: string) => sendInput({ type: "text", text }, text), [sendInput]);
  const startIntent = useCallback((intent: Intent, label: string) => sendInput({ type: "intent", intent }, label), [sendInput]);
  const answer = useCallback(
    (field: ProfileField, value: string | number, label: string) => sendInput({ type: "answer", field, value }, label),
    [sendInput],
  );

  // Read finished replies aloud (and the follow-up question, if any) when enabled.
  useEffect(() => {
    const last = chat.messages.at(-1);
    if (!speech.enabled || !last || last.role !== "assistant" || last.streaming || spoken.current === last.id) return;
    spoken.current = last.id;
    const question = last.blocks.find((b) => b.kind === "question");
    speech.speak([last.text, question?.kind === "question" ? question.question.prompt : ""].filter(Boolean).join(". "));
  }, [chat.messages, speech]);

  const steps = progress(chat.state.profile, chat.state.intent);

  return (
    <div className={styles.shell}>
      <Backdrop />

      <header className={styles.topbar}>
        <a className={styles.brand} href="https://sbgfunding.com/" target="_blank" rel="noreferrer">
          <Logo />
        </a>
        <span className={styles.divider} aria-hidden="true" />
        <div className={styles.assistantName}>
          <strong>Sterling</strong>
          <span>AI funding guide</span>
        </div>
        <div className={styles.spacer} />
        <nav className={styles.navActions} aria-label="Actions">
          <button className={`${styles.ghost} ${styles.hideMedium}`} onClick={() => setInspectorOpen(true)}>
            <LayersIcon /> Under the hood
          </button>
          <button className={`${styles.ghost} ${styles.fileToggle}`} onClick={() => setFileOpen(true)} aria-label="Open your funding file">
            <FileIcon /> {steps.answered}/{steps.total}
          </button>
          <button className={`${styles.outline} ${styles.hideSmall}`} onClick={() => startIntent("human", "Talk to a specialist")} disabled={chat.busy}>
            <PhoneIcon size={16} /> Talk to a specialist
          </button>
          <a className={styles.neon} href={applyUrl(chat.state.profile.amount)} target="_blank" rel="noreferrer">
            Apply Now
          </a>
        </nav>
      </header>

      <main className={styles.workspace}>
        <section className={styles.chat} aria-label="Conversation with Sterling">
          <Progress stages={steps.stages} visible={chat.messages.length > 0} />
          <Conversation
            messages={chat.messages}
            profile={chat.state.profile}
            busy={chat.busy}
            onAnswer={answer}
            onSend={sendInput}
            onIntent={startIntent}
            onText={sendText}
          />
          <Composer busy={chat.busy} onSend={sendText} speech={speech} hasMessages={chat.messages.length > 0} />
        </section>

        <div className={styles.scrim} data-open={fileOpen} onClick={() => setFileOpen(false)} aria-hidden="true" />
        <div className={styles.fileSlot} data-open={fileOpen}>
          <FundingFile
            state={chat.state}
            captures={chat.captures}
            onReset={() => {
              speech.stop();
              chat.reset();
              setFileOpen(false);
            }}
            onClose={() => setFileOpen(false)}
          />
        </div>
      </main>

      <footer className={styles.footer}>
        <span>Unofficial concept prototype - not affiliated with or endorsed by SBG Funding.</span>
        <span>Estimates are illustrative, not offers. <a href="/specialist">Specialist console</a></span>
      </footer>

      <Inspector open={inspectorOpen} traces={chat.traces} onClose={() => setInspectorOpen(false)} />
      <span className="sr-only" aria-live="polite">{chat.busy ? "Sterling is replying" : ""}</span>
    </div>
  );
}
