"use client";

/**
 * Client side of the chat: sends a turn to /api/chat, reads the NDJSON event stream
 * and folds each event into UI state (messages, the funding file, the trace log).
 * The conversation state lives here and is sent with every request - the server keeps
 * nothing between turns.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatEvent, ChatInput, ClientState, Source, TraceEvent, UIBlock } from "@/lib/chat/protocol";
import type { ProfileField } from "@/lib/engine/profile";

export interface UserMessage {
  id: string;
  role: "user";
  text: string;
}

export interface AssistantMessage {
  id: string;
  role: "assistant";
  text: string;
  blocks: UIBlock[];
  sources: Source[];
  status?: string;
  streaming: boolean;
  error?: string;
}

export type Message = UserMessage | AssistantMessage;

export interface TurnTrace {
  id: string;
  label: string;
  startedAt: number;
  events: TraceEvent[];
}

export interface Capture {
  field: ProfileField;
  via: "answer" | "ai";
  at: number;
}

const STORAGE_KEY = "sterling:conversation:v1";
let counter = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;
const freshState = (): ClientState => ({ sessionId: nextId("s"), profile: {}, history: [] });

/** A refresh mid-demo keeps the conversation (per tab; "Start over" clears it). */
function restore(): { messages: Message[]; state: ClientState } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const saved = raw ? (JSON.parse(raw) as { messages: Message[]; state: ClientState }) : null;
    return saved?.state?.sessionId ? { messages: saved.messages ?? [], state: saved.state } : null;
  } catch {
    return null; // storage unavailable - start fresh
  }
}

export function useChat() {
  const [saved] = useState(restore);
  const [messages, setMessages] = useState<Message[]>(() => saved?.messages ?? []);
  const [state, setState] = useState<ClientState>(() => saved?.state ?? freshState());
  const [traces, setTraces] = useState<TurnTrace[]>([]);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [busy, setBusy] = useState(false);
  const stateRef = useRef(state);
  const busyRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    try {
      const settled = messages.map((m) => (m.role === "assistant" ? { ...m, streaming: false, status: undefined } : m));
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: settled, state }));
    } catch {
      // storage full or blocked - not critical
    }
  }, [messages, state]);

  const send = useCallback(async (input: ChatInput, userText?: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);

    const assistantId = nextId("a");
    const turnId = nextId("t");
    const label = userText ?? (input.type === "text" ? input.text : input.type);
    setMessages((prev) => [
      ...prev,
      ...(userText ? [{ id: nextId("u"), role: "user" as const, text: userText }] : []),
      { id: assistantId, role: "assistant", text: "", blocks: [], sources: [], streaming: true },
    ]);
    setTraces((prev) => [{ id: turnId, label, startedAt: Date.now(), events: [] }, ...prev].slice(0, 30));

    const update = (fn: (m: AssistantMessage) => AssistantMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId && m.role === "assistant" ? fn(m) : m)));

    const handle = (event: ChatEvent) => {
      switch (event.type) {
        case "text":
          update((m) => ({ ...m, text: m.text + event.delta, status: undefined }));
          break;
        case "status":
          update((m) => ({ ...m, status: event.label }));
          break;
        case "sources":
          update((m) => ({ ...m, sources: event.sources }));
          break;
        case "ui":
          update((m) => ({ ...m, blocks: [...m.blocks, event.block], status: undefined }));
          break;
        case "profile":
          setState((s) => ({ ...s, profile: event.profile }));
          setCaptures((c) => [...c, ...event.changed.map((field) => ({ field, via: event.via, at: Date.now() }))]);
          break;
        case "trace":
          setTraces((prev) => prev.map((t) => (t.id === turnId ? { ...t, events: [...t.events, event.event] } : t)));
          break;
        case "state":
          setState(event.state);
          break;
        case "error":
          update((m) => ({ ...m, error: event.message }));
          break;
        case "done":
          update((m) => ({ ...m, streaming: false, status: undefined }));
          break;
      }
    };

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: stateRef.current, input }),
      });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) handle(JSON.parse(line) as ChatEvent);
        }
      }
    } catch {
      update((m) => ({ ...m, error: "Sterling couldn't be reached. Check your connection and send again, or call 844-284-2725." }));
    } finally {
      update((m) => ({ ...m, streaming: false, status: undefined }));
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const reset = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setMessages([]);
    setState(freshState());
    setTraces([]);
    setCaptures([]);
  }, []);

  return { messages, state, traces, captures, busy, send, reset };
}
