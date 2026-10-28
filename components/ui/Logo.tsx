import { useId } from "react";

/** Wordmark in the spirit of SBG Funding's: a two-part slanted mark and a stacked name. */
export function Logo({ tone = "light" }: { tone?: "light" | "dark" }) {
  const text = tone === "light" ? "#FFFFFF" : "#002B60";
  const mark = tone === "light" ? "#FFFFFF" : "#006BF1";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }} aria-label="SBG Funding">
      <svg width="34" height="28" viewBox="0 0 34 28" aria-hidden="true">
        <path d="M9 1h12l-6 12H3z" fill={mark} />
        <path d="M21 1h12l-3.2 6.4H17.8z" fill="#36B6FF" />
        <path d="M19 15h12l-6 12H13z" fill={mark} />
        <path d="M6.2 15h11.2l-3.2 6.4H3z" fill={mark} opacity="0.55" />
      </svg>
      <span style={{ display: "grid", lineHeight: 0.92, color: text, fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>SBG</span>
        <span style={{ fontWeight: 400, fontSize: 15 }}>Funding</span>
      </span>
    </span>
  );
}

/** Sterling's avatar: a royal-blue disc with a small spark. */
export function SterlingMark({ size = 30 }: { size?: number }) {
  const gradient = `sterling-${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3389F4" />
          <stop offset="1" stopColor="#0049B8" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill={`url(#${gradient})`} />
      <path d="M16 7.5 17.9 14l6.6 2-6.6 2L16 24.5 14.1 18l-6.6-2 6.6-2z" fill="#FFFFFF" />
      <circle cx="23.5" cy="8.5" r="2.4" fill="#DEE70E" />
    </svg>
  );
}
