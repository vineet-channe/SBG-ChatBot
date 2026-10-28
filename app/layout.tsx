import type { Metadata, Viewport } from "next";
import { Host_Grotesk, Instrument_Sans } from "next/font/google";
import "./globals.css";

// The same typefaces sbgfunding.com uses.
const display = Host_Grotesk({ subsets: ["latin"], variable: "--font-host-grotesk", display: "swap" });
const body = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Sterling · SBG Funding",
  description: "Sterling, SBG Funding's AI funding guide: find the right financing, check eligibility and estimate your funding.",
};

export const viewport: Viewport = {
  themeColor: "#002B60",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
