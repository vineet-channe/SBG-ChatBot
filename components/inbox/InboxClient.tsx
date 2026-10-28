"use client";

/** Rendered in the browser only: it shows times relative to now and polls for new tickets. */
import dynamic from "next/dynamic";

const Inbox = dynamic(() => import("./Inbox"), {
  ssr: false,
  loading: () => <div style={{ minHeight: "100dvh", background: "#eef2f9" }} aria-busy="true" />,
});

export default function InboxClient() {
  return <Inbox />;
}
