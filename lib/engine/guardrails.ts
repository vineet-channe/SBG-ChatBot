/**
 * Input and output guardrails - fast, deterministic checks that run around the model.
 *
 * Input side (before any LLM call):
 *   - PII redaction: SSNs, card numbers and bank account numbers never reach the model
 *     or the logs; the visitor is told to use the secure application instead.
 *   - Routing: explicit requests for a person, complaints/legal threats and payment
 *     hardship go straight to a human. These are too important to leave to a model's
 *     judgment, and rules are instant, free and predictable.
 *   - Prompt-injection markers are flagged so the trace shows them.
 *
 * Output side (after the model answers):
 *   - Catches promises the bot must never make ("you're approved", "guaranteed").
 */

export type Route = "human" | "complaint" | "hardship" | "existing_customer" | null;

export interface GuardrailResult {
  /** Text safe to send to the model and store. */
  text: string;
  redactions: { kind: "ssn" | "card" | "bank_account"; count: number }[];
  route: Route;
  injectionSuspected: boolean;
  /** Which rule fired, for the trace inspector. */
  matched: string[];
}

// 123-45-6789 / 123 45 6789 (phone numbers are 3-3-4, so they don't match)
const SSN_FORMATTED = /\b\d{3}[- ]\d{2}[- ]\d{4}\b/g;
// a bare 9-digit number counts as an SSN only right after SSN wording
const SSN_BARE = /(?<=\b(?:ssn|social security(?: number)?|social|ss#)\D{0,20})\b\d{9}\b/gi;
const CARD_CANDIDATE = /\b(?:\d[ -]?){13,19}\b/g;
// 8-17 digit numbers right after account wording ("routing 021000021", "acct # 12345678")
const ACCOUNT_NUMBER = /(?<=\b(?:account|acct|routing|aba|checking|savings|iban)\b\D{0,20})\b\d{8,17}\b/gi;

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function redactPII(input: string): { text: string; redactions: GuardrailResult["redactions"] } {
  const counts = { ssn: 0, card: 0, bank_account: 0 };
  let text = input
    .replace(SSN_FORMATTED, () => { counts.ssn++; return "[redacted SSN]"; })
    .replace(SSN_BARE, () => { counts.ssn++; return "[redacted SSN]"; });
  text = text.replace(CARD_CANDIDATE, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) { counts.card++; return "[redacted card number]"; }
    return m;
  });
  text = text.replace(ACCOUNT_NUMBER, () => { counts.bank_account++; return "[redacted account number]"; });
  const redactions = (Object.entries(counts) as [keyof typeof counts, number][])
    .filter(([, n]) => n > 0)
    .map(([kind, count]) => ({ kind, count }));
  return { text, redactions };
}

const RULES: { route: Exclude<Route, null>; name: string; pattern: RegExp }[] = [
  {
    route: "complaint",
    name: "complaint_or_legal",
    pattern: /\b(complain(t|ts|ing)?|lawyer|attorney|lawsuit|sue|suing|legal action|fraud(ulent)?|scam(med)?|harass(ed|ing|ment)?|cease and desist|file a (report|complaint)|report you)\b/i,
  },
  {
    route: "hardship",
    name: "payment_hardship",
    pattern: /\b((can'?t|cannot|unable to|won'?t be able to) (make|afford|pay)( (my|the|this|next|a))? (payments?|loan|advance)|missed (a |my |the )?payments?|behind on (my |our )?payments|default(ed|ing)? on|garnish|in collections?)\b/i,
  },
  {
    route: "human",
    name: "asked_for_person",
    pattern: /\b((talk|speak|chat|connect)( me)? (to|with) (a |an |the |some(one|body) |real )?(human|person|someone|somebody|agent|rep(resentative)?|advisor|specialist|manager|loan officer|relationship manager)|real person|live (agent|person|support)|call me( back)?|give me a call|phone call)\b|^\s*(human|agent|representative|operator)\s*[.!?]*\s*$/i,
  },
  {
    route: "existing_customer",
    name: "account_servicing",
    pattern: /\b((my|our) (current |existing |sbg )?(loan|advance|balance|payoff|account|statement|payment schedule|funding agreement|relationship manager)|pay ?off (amount|balance|my)|(change|lower|pause|skip|move|reschedule) (my |our |the )?payments?|already (have|got|has) (a |an )?(loan|advance|line|funding|financing) (with|from) (you|sbg))\b/i,
  },
];

const INJECTION = /\b(ignore (all |any |the )?(previous|prior|above|earlier) (instructions|rules|messages)|disregard (your|the) (instructions|rules|system prompt)|system prompt|you are now|developer mode|jailbreak|pretend (to be|you are))\b/i;

export function checkInput(raw: string): GuardrailResult {
  const { text, redactions } = redactPII(raw);
  const matched: string[] = redactions.map((r) => `pii:${r.kind}`);
  let route: Route = null;
  for (const rule of RULES) {
    if (rule.pattern.test(text)) { route = rule.route; matched.push(`route:${rule.name}`); break; }
  }
  const injectionSuspected = INJECTION.test(text);
  if (injectionSuspected) matched.push("injection_marker");
  return { text, redactions, route, injectionSuspected, matched };
}

const OVERPROMISE = /\b(you('| a)re (pre-?)?approved|you (will|'ll) (be|get) approved|guarantee(d|s)? (approval|funding|financing|you)|approval is guaranteed|100% approval)\b/i;

/** Returns a correction to append if the model's answer over-promises; otherwise null. */
export function checkOutput(answer: string): string | null {
  if (!OVERPROMISE.test(answer)) return null;
  return "To be clear: I can't approve or guarantee financing. An SBG advisor makes that decision after reviewing your bank statements, and applying won't affect your credit score.";
}
