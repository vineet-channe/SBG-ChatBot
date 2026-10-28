"use client";

/**
 * Interactive funding estimate. Runs SBG's calculator model (lib/engine/estimator.ts)
 * in the browser, so the amount slider and the what-if inputs update instantly with
 * no server round trip - the same pure function the server uses.
 */
import { useMemo, useState } from "react";
import { estimateFunding, estimateLineOfCredit, offerFor } from "@/lib/engine/estimator";
import { CREDIT_BANDS, TIME_IN_BUSINESS, creditBand, money, type Profile, type TimeInBusiness } from "@/lib/engine/profile";
import { applyUrl } from "@/lib/sbg/company";
import { ExternalIcon } from "../ui/Icons";
import styles from "./blocks.module.css";

const FREQUENCY_LABEL = { Weekly: "Weekly payment", "Twice-Monthly": "Twice-monthly payment", Monthly: "Monthly payment" } as const;

export function EstimateCard({ profile }: { profile: Profile }) {
  const startBand = creditBand(profile.creditScore)?.value ?? "600_679";
  const [tab, setTab] = useState<"funding" | "loc">("funding");
  const [tib, setTib] = useState<TimeInBusiness>(profile.timeInBusiness ?? "1_2");
  const [band, setBand] = useState<string>(startBand);
  const [revenue, setRevenue] = useState(profile.monthlyRevenue ?? 25_000);
  const [picked, setPicked] = useState<number | null>(null);

  // Keep the customer's exact score until they change the band in the what-if.
  const creditScore = band === startBand && profile.creditScore !== undefined
    ? profile.creditScore
    : CREDIT_BANDS.find((b) => b.value === band)?.typical ?? 640;

  const estimate = useMemo(
    () => estimateFunding({ timeInBusiness: tib, creditScore, monthlyRevenue: revenue, requestedAmount: profile.amount }),
    [tib, creditScore, revenue, profile.amount],
  );
  const loc = useMemo(() => estimateLineOfCredit(revenue), [revenue]);

  const max = estimate.qualified ? estimate.maxOffer.amount : 0;
  const floor = Math.min(5_000, max);
  const fallbackAmount = profile.amount && profile.amount < max ? profile.amount : max;
  const amount = Math.min(Math.max(picked ?? fallbackAmount, floor), max);
  const offer = estimate.qualified ? offerFor(amount, estimate.tier) : null;

  return (
    <section className={styles.card} aria-label="Funding estimate">
      <div className={styles.cardHead}>
        <div>
          <div className={styles.eyebrow}>Funding estimate</div>
          <h3 className={styles.title} style={{ marginTop: 2 }}>What SBG&apos;s calculator model says</h3>
        </div>
        <div className={styles.tabs} role="tablist" aria-label="Estimate type">
          <button role="tab" className={styles.tab} aria-selected={tab === "funding"} onClick={() => setTab("funding")}>Lump sum</button>
          <button role="tab" className={styles.tab} aria-selected={tab === "loc"} onClick={() => setTab("loc")}>Line of credit</button>
        </div>
      </div>

      <div className={styles.cardBody}>
        {tab === "funding" &&
          (estimate.qualified && offer ? (
            <>
              <div className={styles.estimateTop}>
                <div>
                  <div className={styles.bigNumber}>{money(max)}</div>
                  <div className={styles.bigLabel}>Estimated maximum for this profile</div>
                </div>
                <div className={styles.muted} style={{ textAlign: "right" }}>
                  Tier {estimate.tierIndex + 1} of 4 · score {estimate.score}/36
                  <br />
                  {estimate.tier.termMonths}-month term, factor {estimate.tier.rateFactor.toFixed(2)}
                </div>
              </div>

              <div className={styles.sliderBlock}>
                <div className={styles.sliderLabel}>
                  <span>Amount to price</span>
                  <strong>{money(offer.amount)}</strong>
                </div>
                <input
                  className={styles.range}
                  type="range"
                  min={floor}
                  max={max}
                  step={500}
                  value={amount}
                  onChange={(e) => setPicked(Number(e.target.value))}
                  aria-label="Amount to price"
                />
              </div>

              <dl className={styles.outputs}>
                <div className={styles.output}>
                  <dt>{FREQUENCY_LABEL[offer.frequency]}</dt>
                  <dd>{money(offer.payment)}<small>{offer.numberOfPayments} payments</small></dd>
                </div>
                <div className={styles.output}>
                  <dt>Total cost</dt>
                  <dd>{money(offer.totalCost)}<small>on top of {money(offer.amount)}</small></dd>
                </div>
                <div className={styles.output}>
                  <dt>Total repayment</dt>
                  <dd>{money(offer.totalRepayment)}<small>over {offer.termMonths} months</small></dd>
                </div>
              </dl>

              {estimate.requestedExceedsMax && profile.amount && (
                <div className={styles.notice}>
                  You asked about {money(profile.amount)}; this model tops out at {money(max)} for your numbers. It can&apos;t see
                  signed contracts, seasonality or a strong month that hasn&apos;t landed yet - an advisor can.
                </div>
              )}
            </>
          ) : (
            <div className={styles.notice} style={{ marginTop: 0 }}>
              SBG&apos;s calculator gives no automatic estimate for this profile (it scores {estimate.score} of the 10 points its
              lowest tier needs). An advisor can review factors the model can&apos;t see, and owners with 600+ credit and home
              equity can look at a business HELOC.
            </div>
          ))}

        {tab === "loc" && (
          <>
            <div className={styles.estimateTop}>
              <div>
                <div className={styles.bigNumber}>{money(loc.limit)}</div>
                <div className={styles.bigLabel}>Estimated credit limit</div>
              </div>
            </div>
            <dl className={styles.outputs}>
              <div className={styles.output}>
                <dt>Monthly payment</dt>
                <dd>{money(loc.monthlyPayment)}<small>if fully drawn</small></dd>
              </div>
              <div className={styles.output}>
                <dt>Monthly rate</dt>
                <dd>{loc.monthlyRatePct.toFixed(2)}%<small>on the drawn balance only</small></dd>
              </div>
              <div className={styles.output}>
                <dt>Undrawn cost</dt>
                <dd>$0<small>no annual or maintenance fee</small></dd>
              </div>
            </dl>
            {loc.cappedAtMax && <div className={styles.notice}>Capped at SBG&apos;s $500,000 line-of-credit maximum.</div>}
          </>
        )}

        <div className={styles.whatIf}>
          <div className={styles.muted}>Try different numbers:</div>
          <div className={styles.whatIfRow}>
            <label className={styles.field}>
              Time in business
              <select value={tib} onChange={(e) => setTib(e.target.value as TimeInBusiness)}>
                {TIME_IN_BUSINESS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              Credit score
              <select value={band} onChange={(e) => setBand(e.target.value)}>
                {CREDIT_BANDS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              Monthly revenue
              <input
                inputMode="numeric"
                value={new Intl.NumberFormat("en-US").format(revenue)}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/[^\d]/g, ""));
                  if (Number.isFinite(n)) setRevenue(Math.min(n, 1_000_000));
                }}
              />
            </label>
          </div>
        </div>

        <div className={styles.footer}>
          <a
            className={styles.neon}
            href={applyUrl(tab === "loc" ? loc.limit : offer?.amount)}
            target="_blank"
            rel="noreferrer"
          >
            {offer || tab === "loc" ? `Apply for ${money(tab === "loc" ? loc.limit : offer!.amount)}` : "Apply now"} <ExternalIcon size={16} />
          </a>
          <span className={styles.footNote}>
            Same model as SBG&apos;s public calculators. An estimate, not an offer: real offers come from reviewing your 4 most
            recent business bank statements, with no hard credit pull.
          </span>
        </div>
      </div>
    </section>
  );
}
