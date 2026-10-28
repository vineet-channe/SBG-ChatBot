import type { Metadata } from "next";
import InboxClient from "@/components/inbox/InboxClient";

export const metadata: Metadata = {
  title: "Advisor inbox · Sterling",
  description: "Handoffs from Sterling, SBG Funding's AI guide, for funding specialists.",
};

export default function SpecialistPage() {
  return <InboxClient />;
}
