"use client";

/**
 * The funding file - the structured record the conversation builds. It is what an SBG
 * advisor receives on handoff ("your advisor has a name; one person owns your file"),
 * so the customer can watch it fill in and see exactly what will be shared.
 */
import type { ClientState } from "@/lib/chat/protocol";
import { evaluate, REQUIRED_FIELDS } from "@/lib/engine/eligibility";
import { describeField, FIELD_LABELS, money, type ProfileField } from "@/lib/engine/profile";
import { PRODUCTS } from "@/lib/sbg/products";
import type { Capture } from "../chat/useChat";
import { CheckIcon, CloseIcon, CrossIcon, FileIcon, RefreshIcon } from "../ui/Icons";
import styles from "./file.module.css";

const SECTIONS: { label: string; fields: ProfileField[] }[] = [
  { label: "Your need", fields: ["purpose", "amount", "timeline"] },
  { label: "Business", fields: ["businessType", "industry", "timeInBusiness"] },
  { label: "Financials", fields: ["monthlyRevenue", "creditScore", "hasInvoices", "repaymentEvent", "ownsHome"] },
];
const OPTIONAL: ProfileField[] = ["hasInvoices", "repaymentEvent", "ownsHome"];

interface Props {
  state: ClientState;
  captures: Capture[];
  onReset: () => void;
  onClose: () => void;
}

export function FundingFile({ state, captures, onReset, onClose }: Props) {
  const { profile } = state;
  const result = evaluate(profile);
  const filled = REQUIRED_FIELDS.filter((f) => profile[f] !== undefined).length;
  const lastCapture = (field: ProfileField) => [...captures].reverse().find((c) => c.field === field);
  const minimums = result.checks.filter((c) => c.id === "credit" || c.id === "time" || c.id === "revenue");
  const best = result.matches.find((m) => m.status !== "not_now");
  const showBest = filled === REQUIRED_FIELDS.length && best;
  const estimate = result.fundingEstimate?.qualified ? result.fundingEstimate.maxOffer.amount : undefined;

  const headline = [describeField("businessType", profile), describeField("industry", profile)].filter(Boolean).join(" · ");

  return (
    <aside className={styles.file} aria-label="Your funding file">
      <button className={styles.close} onClick={onClose} aria-label="Close funding file">
        <CloseIcon size={18} />
      </button>
      <div className={styles.scroll}>
        <span className={styles.tab}>
          <FileIcon size={15} /> Funding file
        </span>
        <h2 className={styles.title}>{headline || "Your business, at a glance"}</h2>
        <div className={styles.subtitle}>
          {filled === 0 ? "Fills in as we talk - this is what your advisor will see." : "Built from our conversation."}
        </div>

        <div className={styles.meter}>
          <div className={styles.meterTrack}>
            <div className={styles.meterFill} style={{ width: `${(filled / REQUIRED_FIELDS.length) * 100}%` }} />
          </div>
          <div className={styles.meterLabel}>
            <span>{filled} of {REQUIRED_FIELDS.length} details</span>
            <span>{filled === REQUIRED_FIELDS.length ? "Complete" : "In progress"}</span>
          </div>
        </div>

        {SECTIONS.map((section) => (
          <div key={section.label} className={styles.section}>
            <div className={styles.sectionLabel}>{section.label}</div>
            <dl className={styles.rows}>
              {section.fields
                .filter((f) => !OPTIONAL.includes(f) || profile[f] !== undefined)
                .map((field) => {
                  const value = describeField(field, profile);
                  const capture = lastCapture(field);
                  return (
                    <div key={field} className={styles.row}>
                      <dt>{FIELD_LABELS[field]}</dt>
                      <dd>
                        {value ? (
                          <>
                            <span key={capture?.at ?? field} className={styles.value} data-via={capture?.via ?? "answer"}>
                              {value}
                            </span>
                            {capture?.via === "ai" && <span className={styles.fromChat}>From your message</span>}
                          </>
                        ) : (
                          <span className={styles.empty}>-</span>
                        )}
                      </dd>
                    </div>
                  );
                })}
            </dl>
          </div>
        ))}

        <div className={styles.section}>
          <div className={styles.sectionLabel}>SBG minimums</div>
          <ul className={styles.minimums}>
            {minimums.map((c) => (
              <li key={c.id} className={styles.minimum} data-status={c.status}>
                <span className={styles.mark} aria-hidden="true">
                  {c.status === "pass" ? <CheckIcon size={13} /> : c.status === "fail" ? <CrossIcon size={13} /> : null}
                </span>
                <span>
                  {c.label}
                  <span className="sr-only"> - {c.status === "pass" ? "met" : c.status === "fail" ? "not met" : "not checked yet"}</span>
                </span>
              </li>
            ))}
            <li className={styles.minimum} data-status="info">
              <span className={styles.mark} aria-hidden="true"><FileIcon size={12} /></span>
              <span>4 recent bank statements to apply</span>
            </li>
          </ul>
        </div>

        {showBest && best && (
          <div className={styles.best}>
            <div className={styles.sectionLabel} style={{ margin: 0 }}>Best fit so far</div>
            <div className={styles.bestName}>{PRODUCTS[best.product].name}</div>
            <div className={styles.bestMeta}>
              {estimate ? `Calculator estimate up to ${money(estimate)}` : PRODUCTS[best.product].amountLabel}
            </div>
          </div>
        )}
      </div>

      <div className={styles.foot}>
        {state.ticketId ? (
          <span className={styles.shared}>
            <CheckIcon size={15} /> Shared with an advisor · {state.ticketId}
          </span>
        ) : (
          <span>Nothing is submitted until you apply.</span>
        )}
        <button className={styles.reset} onClick={onReset}>
          <RefreshIcon size={14} /> Start over
        </button>
      </div>
    </aside>
  );
}
