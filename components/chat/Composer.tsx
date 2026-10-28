"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MicIcon, SendIcon, SpeakerIcon, SpeakerOffIcon } from "../ui/Icons";
import styles from "./chat.module.css";
import { useSpeechInput, type useSpeechOutput } from "./voice";

interface Props {
  busy: boolean;
  hasMessages: boolean;
  onSend: (text: string) => void;
  speech: ReturnType<typeof useSpeechOutput>;
}

export function Composer({ busy, hasMessages, onSend, speech }: Props) {
  const [value, setValue] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      onSend(trimmed);
      setValue("");
    },
    [busy, onSend],
  );

  // Spoken input is sent as soon as the speaker pauses, exactly like typed text.
  const voice = useSpeechInput(submit);

  const placeholder = voice.listening ? "Listening…" : hasMessages ? "Reply, or ask anything" : "Ask a question or describe your business";

  // Grow with the text (or a placeholder that wraps), up to the max height in CSS.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, voice.interim, placeholder]);

  return (
    <div className={styles.composer}>
      <form
        className={styles.inputRow}
        data-listening={voice.listening}
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
      >
        {voice.supported && (
          <button
            type="button"
            className={`${styles.iconButton} ${styles.mic}`}
            data-listening={voice.listening}
            onClick={voice.listening ? voice.stop : voice.start}
            aria-label={voice.listening ? "Stop listening" : "Speak your message"}
            disabled={busy && !voice.listening}
          >
            <MicIcon size={20} />
          </button>
        )}
        <label htmlFor="sterling-input" className="sr-only">
          Message Sterling
        </label>
        <textarea
          id="sterling-input"
          ref={textarea}
          className={styles.textarea}
          rows={1}
          value={voice.listening ? voice.interim : value}
          readOnly={voice.listening}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit(value);
            }
          }}
          maxLength={2000}
        />
        {speech.supported && (
          <button
            type="button"
            className={styles.iconButton}
            onClick={speech.toggle}
            aria-pressed={speech.enabled}
            aria-label={speech.enabled ? "Stop reading replies aloud" : "Read replies aloud"}
            title={speech.enabled ? "Reading replies aloud" : "Read replies aloud"}
          >
            {speech.enabled ? <SpeakerIcon size={20} /> : <SpeakerOffIcon size={20} />}
          </button>
        )}
        <button type="submit" className={styles.sendButton} disabled={busy || !value.trim() || voice.listening} aria-label="Send message">
          <SendIcon size={19} />
        </button>
      </form>
      <div className={styles.composerNote}>
        {voice.error ? <span className={styles.voiceError}>{voice.error}</span> : <span>Never share your SSN or bank account numbers in chat.</span>}
        <span>Answers come from SBG&apos;s published information and are cited.</span>
      </div>
    </div>
  );
}
