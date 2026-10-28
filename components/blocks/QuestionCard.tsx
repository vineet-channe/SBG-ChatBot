"use client";

import { useState } from "react";
import { answerLabel, type OptionChoice, type Question, type QuestionInput } from "@/lib/engine/flow";
import type { ProfileField } from "@/lib/engine/profile";
import { ArrowRightIcon } from "../ui/Icons";
import styles from "./blocks.module.css";

interface Props {
  question: Question;
  active: boolean;
  onAnswer: (field: ProfileField, value: string | number, label: string) => void;
}

const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
const short = (n: number) =>
  n >= 1_000_000 ? `$${+(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${+(n / 1_000).toFixed(1)}K` : `$${n}`;

type MoneySpec = Extract<QuestionInput, { kind: "money" }>;

/** Money picker: type it, slide it (log scale - $5K and $5M both need room) or tap a preset. */
function MoneyInput({ prompt, input, onSubmit }: { prompt: string; input: MoneySpec; onSubmit: (value: number) => void }) {
  const { min, max, presets, defaultValue, suffix } = input;
  const [value, setValue] = useState(defaultValue);
  const low = Math.max(min, 1_000);
  const toSlider = (v: number) => Math.round((Math.log(Math.max(v, low) / low) / Math.log(max / low)) * 1000);
  const fromSlider = (s: number) => {
    const raw = low * Math.pow(max / low, s / 1000);
    const step = raw < 10_000 ? 500 : raw < 100_000 ? 1_000 : raw < 1_000_000 ? 5_000 : 50_000;
    return Math.round(raw / step) * step;
  };
  const valid = value >= min && value <= max && value > 0;

  return (
    <form
      className={styles.money}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(value);
      }}
    >
      <label className={styles.moneyValue}>
        <span aria-hidden="true">$</span>
        <input
          className={styles.moneyInput}
          inputMode="numeric"
          aria-label={prompt}
          value={fmt(value)}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/[^\d]/g, ""));
            if (Number.isFinite(n)) setValue(Math.min(n, max));
          }}
        />
        {suffix && <span className={styles.moneySuffix}>{suffix}</span>}
      </label>
      <input
        className={styles.range}
        type="range"
        min={0}
        max={1000}
        value={toSlider(value)}
        onChange={(e) => setValue(fromSlider(Number(e.target.value)))}
        aria-label="Adjust amount"
      />
      <div className={styles.moneyFoot}>
        <div className={styles.presets}>
          {presets.map((p) => (
            <button type="button" key={p} className={styles.preset} aria-pressed={p === value} onClick={() => setValue(p)}>
              {short(p)}
              {suffix ?? ""}
            </button>
          ))}
        </div>
        <button type="submit" className={styles.neon} disabled={!valid}>
          Continue <ArrowRightIcon size={16} />
        </button>
      </div>
    </form>
  );
}

function OptionButtons({ options, layout, onPick }: { options: OptionChoice[]; layout: "grid" | "list" | "chips"; onPick: (o: OptionChoice) => void }) {
  if (layout === "chips") {
    const groups = [...new Set(options.map((o) => o.group ?? ""))];
    return (
      <div className={styles.groups}>
        {groups.map((group) => (
          <div key={group}>
            {group && <div className={styles.groupLabel}>{group}</div>}
            <div className={styles.chips}>
              {options.filter((o) => (o.group ?? "") === group).map((o) => (
                <button key={o.value} className={styles.chip} onClick={() => onPick(o)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={styles.options} data-layout={layout}>
      {options.map((o) => (
        <button key={o.value} className={styles.option} onClick={() => onPick(o)}>
          {o.label}
          {o.hint && <span className={styles.optionHint}>{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

export function QuestionCard({ question, active, onAnswer }: Props) {
  const answer = (value: string | number) => onAnswer(question.field, value, answerLabel(question, value));
  return (
    <div className={styles.question} data-active={active}>
      <h3 className={styles.prompt}>{question.prompt}</h3>
      {active && question.hint && <p className={styles.hint}>{question.hint}</p>}
      {active &&
        (question.input.kind === "money" ? (
          <MoneyInput prompt={question.prompt} input={question.input} onSubmit={answer} />
        ) : (
          <OptionButtons options={question.input.options} layout={question.input.layout} onPick={(o) => answer(o.value)} />
        ))}
    </div>
  );
}
