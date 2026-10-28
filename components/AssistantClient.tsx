"use client";

/**
 * The assistant renders in the browser only: it restores the conversation from
 * sessionStorage and detects voice support on first render, neither of which exists on
 * the server. (It's an app screen, so there is nothing to gain from server rendering.)
 */
import dynamic from "next/dynamic";

const Assistant = dynamic(() => import("./Assistant"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: "100dvh",
        background: "linear-gradient(180deg, #002b60 0%, #003f8f 38%, #0b5fd6 78%, #3a86ee 100%)",
      }}
      aria-busy="true"
    />
  ),
});

export default function AssistantClient() {
  return <Assistant />;
}
