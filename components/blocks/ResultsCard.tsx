"use client";

import type { EligibilityResult, ProductMatch } from "@/lib/engine/eligibility";
import type { Intent } from "@/lib/engine/flow";
import type { Profile } from "@/lib/engine/profile";
import { applyUrl } from "@/lib/sbg/company";
import { PRODUCTS } from "@/lib/sbg/products";
import { CheckIcon, CrossIcon, DotIcon, ExternalIcon, FileIcon, PhoneIcon } from "../ui/Icons";
import styles from "./blocks.module.css";

const STATUS_LABEL: Record<ProductMatch["status"], string> = {
  strong: "Strong fit",
  possible: "Worth discussing",
  not_now: "Not a fit yet",
};

function MatchCard({ match, best, onText }: { match: ProductMatch; best: boolean; onText: (t: string) => void }) {
  const product = PRODUCTS[match.product];
  return (
    <article className={styles.match} data-best={best}>
      <div className={styles.matchHead}>
        <h4 className={styles.matchName}>{product.name}</h4>
        <span className={styles.badge} data-status={match.status}>{best && match.status === "strong" ? "Best fit" : STATUS_LABEL[match.status]}</span>
      </div>
      <p className={styles.summary}>{product.summary}</p>
      {match.why.length > 0 && (
        <ul className={styles.why}>
          {match.why.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
      <dl className={styles.facts}>
        <div><dt>Amount</dt><dd>{product.amountLabel}</dd></div>
        <div><dt>Term</dt><dd>{product.termLabel}</dd></div>
        <div><dt>Speed</dt><dd>{product.speedLabel}</dd></div>
        <div><dt>Collateral</dt><dd>{product.collateralLabel}</dd></div>
      </dl>
      {match.cautions.length > 0 && (
        <ul className={styles.cautions}>
          {match.cautions.map((c) => <li key={c}>{c}</li>)}
        </ul>
      )}
      <div className={styles.matchActions}>
        <button className={styles.link} onClick={() => onText(`Tell me more about ${product.name} for my business.`)}>
          Ask about this
        </button>
        <a className={styles.link} href={product.url} target="_blank" rel="noreferrer">
          Product details <ExternalIcon size={14} />
        </a>
      </div>
    </article>
  );
}

export function ResultsCard({ result, profile, onText, onIntent }: {
  result: EligibilityResult;
  profile: Profile;
  onText: (t: string) => void;
  onIntent: (intent: Intent, label: string) => void;
}) {
  const fits = result.matches.filter((m) => m.status !== "not_now").slice(0, 3);
  const notNow = result.matches.filter((m) => m.status === "not_now").slice(0, 4);
  const coreChecks = result.checks.filter((c) => c.id !== "documents" && c.id !== "industry");

  return (
    <section className={styles.card} aria-label="Your matches">
      <div className={styles.cardBody}>
        <div className={styles.eyebrow}>SBG&apos;s published requirements</div>
        <div className={styles.checks} style={{ marginTop: 10 }}>
          {coreChecks.map((c) => (
            <div key={c.id} className={styles.check} data-status={c.status}>
              <span className={styles.checkIcon}>
                {c.status === "pass" ? <CheckIcon size={15} /> : c.status === "fail" ? <CrossIcon size={15} /> : <DotIcon size={12} />}
              </span>
              <span className={styles.checkLabel}>{c.label}</span>
              <span className={styles.checkDetail}>{c.detail}</span>
              {c.fix && <span className={styles.fix}>{c.fix}</span>}
            </div>
          ))}
          <div className={styles.check} data-status="info">
            <span className={styles.checkIcon}><FileIcon size={15} /></span>
            <span className={styles.checkLabel}>4 recent bank statements</span>
            <span className={styles.checkDetail}>All you need to apply</span>
          </div>
        </div>

        {fits.length > 0 && (
          <>
            <div className={styles.sectionLabel}>Best fits for your business</div>
            <div className={styles.matches}>
              {fits.map((m, i) => <MatchCard key={m.product} match={m} best={i === 0} onText={onText} />)}
            </div>
          </>
        )}

        {notNow.length > 0 && (
          <details className={styles.notNow}>
            <summary>Not a fit yet ({notNow.length}) - and what would change it</summary>
            {notNow.map((m) => (
              <div key={m.product} className={styles.notNowItem}>
                <strong>{PRODUCTS[m.product].name}:</strong> {m.blockers.join("; ")}.{" "}
                {m.fixes[0] && <span>{m.fixes[0]}</span>}
              </div>
            ))}
          </details>
        )}

        <div className={styles.footer}>
          <a className={styles.neon} href={applyUrl(profile.amount)} target="_blank" rel="noreferrer">
            Apply now <ExternalIcon size={16} />
          </a>
          <button className={styles.secondary} onClick={() => onIntent("human", "Talk to a specialist")}>
            <PhoneIcon size={16} /> Talk to a specialist
          </button>
          <span className={styles.footNote}>
            Pre-qualification against SBG&apos;s published criteria, not an approval. Applying takes about 5 minutes, uses a
            soft credit pull and an SBG advisor reviews every application.
          </span>
        </div>
      </div>
    </section>
  );
}
