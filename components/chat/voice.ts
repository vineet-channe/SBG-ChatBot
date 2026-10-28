"use client";

/**
 * Voice in and out, using the browser's built-in Web Speech API (no extra service or key).
 *   - Speech-to-text: Chrome, Edge and Safari support SpeechRecognition.
 *   - Text-to-speech: speechSynthesis is available in all modern browsers.
 * The server never sees audio - only the transcribed text, exactly as if it were typed.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface RecognitionEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function useSpeechInput(onFinal: (text: string) => void) {
  const [supported] = useState(() => Boolean(recognitionCtor()));
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const finalText = useRef("");
  const callback = useRef(onFinal);

  useEffect(() => {
    callback.current = onFinal;
  }, [onFinal]);

  useEffect(() => () => recognition.current?.abort(), []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || recognition.current) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    finalText.current = "";
    setError(null);
    rec.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) finalText.current += result[0].transcript;
        else interimText += result[0].transcript;
      }
      setInterim((finalText.current + " " + interimText).trim());
    };
    rec.onerror = (e) => {
      setError(e.error === "not-allowed" ? "Microphone access is blocked for this site." : "I didn't catch that - try again.");
    };
    rec.onend = () => {
      recognition.current = null;
      setListening(false);
      setInterim("");
      const text = finalText.current.trim();
      if (text) callback.current(text);
    };
    recognition.current = rec;
    rec.start();
    setListening(true);
  }, []);

  const stop = useCallback(() => recognition.current?.stop(), []);

  return { supported, listening, interim, error, start, stop };
}

/** Strips formatting and citation markers so replies read naturally aloud. */
export function speakable(text: string): string {
  return text
    .replace(/\[(\d+)\]/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readAloudPreference(): boolean {
  try {
    return localStorage.getItem("sterling:read-aloud") === "1";
  } catch {
    return false; // storage blocked - default off
  }
}

export function useSpeechOutput() {
  const [supported] = useState(() => typeof window !== "undefined" && "speechSynthesis" in window);
  const [enabled, setEnabled] = useState(readAloudPreference);

  const toggle = useCallback(() => {
    setEnabled((on) => {
      const next = !on;
      try {
        localStorage.setItem("sterling:read-aloud", next ? "1" : "0");
      } catch {
        // ignore
      }
      if (!next) window.speechSynthesis?.cancel();
      return next;
    });
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const clean = speakable(text);
    if (!clean) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    const voices = window.speechSynthesis.getVoices();
    utterance.voice =
      voices.find((v) => /en-US/i.test(v.lang) && /(Samantha|Google US English|Aria|Jenny)/i.test(v.name)) ??
      voices.find((v) => /en-US/i.test(v.lang)) ??
      null;
    utterance.rate = 1.03;
    window.speechSynthesis.speak(utterance);
  }, []);

  const stop = useCallback(() => window.speechSynthesis?.cancel(), []);

  return { supported, enabled, toggle, speak, stop };
}
