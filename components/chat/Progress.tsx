import styles from "./chat.module.css";

interface Stage {
  id: string;
  label: string;
  status: "done" | "active" | "todo";
}

/** Four-step progress bar, modeled on the one at the top of SBG's application. */
export function Progress({ stages, visible }: { stages: Stage[]; visible: boolean }) {
  if (!visible) return null;
  return (
    <ol className={styles.progress} aria-label="Progress">
      {stages.map((s) => (
        <li key={s.id} className={styles.segment} data-status={s.status} aria-current={s.status === "active" ? "step" : undefined}>
          {s.label}
          <span className="sr-only">{s.status === "done" ? " (complete)" : s.status === "active" ? " (in progress)" : ""}</span>
        </li>
      ))}
    </ol>
  );
}
