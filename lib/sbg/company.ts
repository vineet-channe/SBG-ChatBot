/**
 * SBG Funding facts used directly by code (contact card, business hours, minimums).
 * Everything here is published on sbgfunding.com (checked October 2026); the
 * knowledge base PDF carries the same facts for retrieval.
 */
export const SBG = {
  name: "SBG Funding",
  tagline: "Capital That Keeps Up",
  phone: "844-284-2725",
  phoneHref: "tel:+18442842725",
  address: "240 W 40th Street, 8th Floor, New York, NY 10018",
  hours: {
    label: "Mon-Fri, 9am-6pm ET",
    timeZone: "America/New_York",
    openHour: 9,
    closeHour: 18,
    weekdays: [1, 2, 3, 4, 5], // Monday..Friday
  },
  urls: {
    site: "https://sbgfunding.com/",
    apply: "https://apply.sbgfunding.com/",
    portal: "https://app.sbgfunding.com/login",
    contact: "https://sbgfunding.com/contact-us/",
    faqs: "https://sbgfunding.com/faqs/",
    calculator: "https://sbgfunding.com/sbgfunding-calculator/",
    locCalculator: "https://sbgfunding.com/line-of-credit-calculator/",
  },
  stats: [
    { value: "$3B+", label: "funded since 2017" },
    { value: "28,000+", label: "businesses funded" },
    { value: "4.9", label: "Trustpilot rating" },
    { value: "Soft pull", label: "no credit impact" },
  ],
  /** The four published minimums ("High standards. Low hurdles."). */
  minimums: {
    fico: 500,
    monthsInBusiness: 6,
    annualRevenue: 150_000,
    bankStatements: 4,
  },
  helocMinFico: 600,
  /** "The main exceptions are adult entertainment and gambling." (FAQ) */
  restrictedIndustries: ["gambling", "adult_entertainment"] as const,
} as const;

/** Link to SBG's application, pre-filled the same way SBG's own calculator does it. */
export function applyUrl(amount?: number): string {
  if (!amount || amount <= 0) return SBG.urls.apply;
  const url = new URL(SBG.urls.apply);
  url.searchParams.set("loan_amount", String(Math.round(amount)));
  return url.toString();
}
