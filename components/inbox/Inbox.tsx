"use client";

/**
 * The advisor's side of a warm handoff. Every ticket Sterling opens lands here with the
 * customer's profile, where they stand against SBG's minimums, a summary to read first
 * and the redacted conversation, so the customer never has to repeat themselves.
 *
 * It polls /api/handoff every few seconds. In production this would be a CRM queue
 * behind staff sign-in, with push alerts for high-priority tickets.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { REASON_LABELS, SERVICING_REASONS } from "@/lib/chat/protocol";
import { describeField, FIELD_LABELS, type ProfileField } from "@/lib/engine/profile";
import type { Ticket } from "@/lib/handoff/store";
import { SBG } from "@/lib/sbg/company";
import { Markdown } from "../chat/Markdown";
import { ArrowRightIcon, CheckIcon, ClockIcon, CrossIcon, PhoneIcon, SparkIcon } from "../ui/Icons";
import { Logo } from "../ui/Logo";
import styles from "./inbox.module.css";

type Status = Ticket["status"];

const POLL_MS = 4000;

const STATUS_LABELS: Record<Status, string> = {
  new: "New",
  callback_requested: "Callback requested",
  contacted: "Contacted",
  closed: "Closed",
};

// Urgent tickets first, then customers waiting for a call, then the newest.
const STATUS_ORDER: Record<Status, number> = { callback_requested: 0, new: 1, contacted: 2, closed: 3 };
const rank = (t: Ticket) => (t.priority === "high" ? 0 : 10) + STATUS_ORDER[t.status];

const EASTERN = new Intl.DateTimeFormat("en-US", {
  timeZone: SBG.hours.timeZone,
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

function elapsed(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60} min`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function ago(iso: string, now: number): string {
  const ms = now - Date.parse(iso);
  return ms < 60_000 ? "just now" : `${elapsed(ms).replace(/ \d+ min$/, "")} ago`;
}

function TicketRow({ ticket, selected, now, onSelect }: { ticket: Ticket; selected: boolean; now: number; onSelect: () => void }) {
  const meta = [ticket.contact?.name, describeField("industry", ticket.profile), describeField("amount", ticket.profile)].filter(Boolean);
  return (
    <button className={styles.row} data-selected={selected} data-priority={ticket.priority} onClick={onSelect} aria-current={selected || undefined}>
      <span className={styles.rowTop}>
        <span className={styles.code}>{ticket.id}</span>
        <span className={styles.ago}>{ago(ticket.createdAt, now)}</span>
      </span>
      <span className={styles.rowReason}>{REASON_LABELS[ticket.reason]}</span>
      <span className={styles.rowMeta}>{meta.length ? meta.join(" · ") : "No business details yet"}</span>
      <span className={styles.tags}>
        {ticket.priority === "high" && <span className={`${styles.pill} ${styles.priority}`}>High priority</span>}
        <span className={styles.pill} data-status={ticket.status}>{STATUS_LABELS[ticket.status]}</span>
      </span>
    </button>
  );
}

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className={styles.facts}>
      {rows.map(([label, value]) => (
        <div key={label} className={styles.fact}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TicketDetail({
  ticket,
  now,
  updating,
  onStatus,
  onBack,
}: {
  ticket: Ticket;
  now: number;
  updating: boolean;
  onStatus: (status: Status) => void;
  onBack: () => void;
}) {
  const profile = (Object.keys(FIELD_LABELS) as ProfileField[])
    .map((field) => [FIELD_LABELS[field], describeField(field, ticket.profile)] as [string, string | undefined])
    .filter((row): row is [string, string] => row[1] !== undefined);
  const waiting = ticket.status === "new" || ticket.status === "callback_requested";
  const waitedMs = now - Date.parse(ticket.createdAt);
  const contact = ticket.contact;

  return (
    <article className={styles.ticket} aria-labelledby="ticket-code">
      <button className={styles.backToList} onClick={onBack}>
        <ArrowRightIcon size={15} style={{ transform: "rotate(180deg)" }} /> All handoffs
      </button>

      <header className={styles.ticketHead}>
        <div>
          <span className={styles.eyebrow}>Reference code</span>
          <h2 id="ticket-code" className={styles.bigCode}>
            {/* keyed so the highlighter sweeps again when another ticket opens */}
            <mark key={ticket.id}>{ticket.id}</mark>
          </h2>
          <p className={styles.headMeta}>
            <span>{REASON_LABELS[ticket.reason]}</span>
            <span>Escalated {EASTERN.format(new Date(ticket.createdAt))} ET</span>
            {waiting && (
              <span className={styles.waiting} data-late={waitedMs > 30 * 60_000}>
                <ClockIcon size={15} /> Waiting {elapsed(waitedMs)}
              </span>
            )}
          </p>
        </div>
        <div className={styles.actions}>
          {ticket.status === "closed" ? (
            <button className={styles.secondary} onClick={() => onStatus("new")} disabled={updating}>
              Reopen
            </button>
          ) : (
            <>
              {ticket.status !== "contacted" && (
                <button className={styles.primary} onClick={() => onStatus("contacted")} disabled={updating}>
                  <CheckIcon size={16} /> Mark contacted
                </button>
              )}
              <button className={styles.secondary} onClick={() => onStatus("closed")} disabled={updating}>
                Close ticket
              </button>
            </>
          )}
        </div>
      </header>

      <section className={styles.summary} aria-label="Handoff note">
        <div className={styles.summaryHead}>
          <span className={styles.summaryLabel}>Read this first</span>
          <span className={styles.summarySource}>
            {ticket.summarySource === "ai" ? (
              <>
                <SparkIcon size={14} /> Written by AI from the conversation
              </>
            ) : (
              "Generated from the captured profile"
            )}
          </span>
        </div>
        <p className={styles.summaryText}>{ticket.summary}</p>
        {ticket.note && (
          <p className={styles.assistantNote}>
            <strong>Why Sterling escalated:</strong> {ticket.note}
          </p>
        )}
      </section>

      <div className={styles.columns}>
        <div className={styles.stack}>
          <section className={`${styles.card} ${styles.callCard}`}>
            <h3>
              Call back
              {ticket.priority === "high" && <span className={`${styles.pill} ${styles.priority}`}>High priority</span>}
            </h3>
            {contact ? (
              <>
                <Facts
                  rows={[
                    ["Name", contact.name],
                    ["Phone", <a key="phone" className={styles.link} href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>{contact.phone}</a>],
                    ...(contact.email ? [["Email", <a key="email" className={styles.link} href={`mailto:${contact.email}`}>{contact.email}</a>] as [string, React.ReactNode]] : []),
                    ["Best time", contact.bestTime || "Any time"],
                  ]}
                />
                {contact.message && <p className={styles.message}>&ldquo;{contact.message}&rdquo;</p>}
              </>
            ) : (
              <p className={styles.muted}>
                No callback requested yet. The customer was given reference <strong>{ticket.id}</strong> and SBG&apos;s number,{" "}
                {SBG.phone}, so a call can be matched to this conversation.
              </p>
            )}
          </section>

          <section className={`${styles.card} ${styles.conversation}`}>
            <h3>
              Conversation
              <small>Card, Social Security and account numbers are redacted before anything is stored.</small>
            </h3>
            {ticket.transcript.length ? (
              <ol className={styles.transcript}>
                {ticket.transcript.map((turn, i) => (
                  <li key={i} className={styles.turn} data-role={turn.role}>
                    <span className={styles.who}>{turn.role === "user" ? "Customer" : "Sterling"}</span>
                    <div className={styles.said}>
                      <Markdown text={turn.text} />
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.muted}>No messages yet.</p>
            )}
          </section>
        </div>

        <section className={`${styles.card} ${styles.profileCard}`}>
          <h3>Business profile</h3>
          {profile.length ? <Facts rows={profile} /> : <p className={styles.muted}>The customer escalated before sharing business details.</p>}
          {!SERVICING_REASONS.includes(ticket.reason) && (
            <div className={styles.fit}>
              {ticket.meetsMinimums === null ? (
                <span className={styles.fitLine}>Published minimums not checked yet</span>
              ) : (
                <span className={styles.fitLine} data-ok={ticket.meetsMinimums}>
                  {ticket.meetsMinimums ? <CheckIcon size={16} /> : <CrossIcon size={16} />}
                  {ticket.meetsMinimums ? "Meets SBG's published minimums" : "Misses at least one published minimum"}
                </span>
              )}
              {ticket.topMatches.length > 0 && (
                <div className={styles.products}>
                  <span className={styles.productsLabel}>Best fits</span>
                  {ticket.topMatches.map((name) => (
                    <span key={name} className={styles.product}>{name}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </article>
  );
}

function NoTickets({ view }: { view: "open" | "closed" }) {
  return (
    <div className={styles.none}>
      {view === "open" ? (
        <>
          <p className={styles.noneTitle}>No open handoffs</p>
          <p>
            Sterling opens a ticket when a customer asks for a person, raises a complaint or payment hardship, needs their
            account serviced, or asks something the knowledge base can&apos;t answer.
          </p>
          <Link className={styles.link} href="/">
            Open Sterling <ArrowRightIcon size={14} />
          </Link>
        </>
      ) : (
        <p className={styles.noneTitle}>No closed handoffs</p>
      )}
    </div>
  );
}

export default function Inbox() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<"open" | "closed">("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  // Poll the ticket store; state is only set in the response callbacks.
  useEffect(() => {
    const load = () =>
      fetch("/api/handoff", { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json() as Promise<{ tickets: Ticket[] }>;
        })
        .then((data) => {
          setTickets(data.tickets);
          setOffline(false);
        })
        .catch(() => setOffline(true))
        .finally(() => setNow(Date.now()));
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const counts = useMemo(() => {
    const all = tickets ?? [];
    return {
      open: all.filter((t) => t.status !== "closed").length,
      closed: all.filter((t) => t.status === "closed").length,
      waiting: all.filter((t) => t.status === "callback_requested").length,
    };
  }, [tickets]);

  const visible = useMemo(
    () =>
      (tickets ?? [])
        .filter((t) => (view === "closed") === (t.status === "closed"))
        .sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt)),
    [tickets, view],
  );
  const selected = visible.find((t) => t.id === selectedId) ?? visible[0];

  const setStatus = async (ticket: Ticket, status: Status) => {
    setUpdating(ticket.id);
    try {
      const response = await fetch("/api/handoff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: ticket.id, status }),
      });
      if (response.ok) {
        const { ticket: updated } = (await response.json()) as { ticket: Ticket };
        setTickets((list) => list?.map((t) => (t.id === updated.id ? updated : t)) ?? null);
      }
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <a className={styles.brand} href="https://sbgfunding.com/" target="_blank" rel="noreferrer">
          <Logo />
        </a>
        <span className={styles.divider} aria-hidden="true" />
        <div className={styles.heading}>
          <strong>Advisor inbox</strong>
          <span>Handoffs from Sterling</span>
        </div>
        <div className={styles.spacer} />
        <span className={styles.live} data-offline={offline} role="status">
          <span className={styles.pulse} aria-hidden="true" />
          {offline ? "Reconnecting" : "Live"}
        </span>
        <Link className={styles.back} href="/">
          <span className={styles.backVerb}>Open </span>Sterling <ArrowRightIcon size={15} />
        </Link>
      </header>

      <main className={styles.main} data-view={showDetail ? "detail" : "list"}>
        <aside className={styles.list} aria-label="Handoffs">
          <div className={styles.listHead}>
            <h1>Handoffs</h1>
            <p>
              <PhoneIcon size={14} /> {counts.waiting} waiting for a callback
            </p>
            <div className={styles.tabs} role="tablist" aria-label="Filter handoffs">
              {(["open", "closed"] as const).map((v) => (
                <button key={v} className={styles.tab} role="tab" aria-selected={view === v} onClick={() => setView(v)}>
                  {v === "open" ? "Open" : "Closed"} <span className={styles.count}>{counts[v]}</span>
                </button>
              ))}
            </div>
          </div>
          {tickets === null ? (
            <p className={styles.loading}>{offline ? "Can't reach the server. Retrying." : "Loading handoffs"}</p>
          ) : visible.length === 0 ? (
            <NoTickets view={view} />
          ) : (
            <ul className={styles.items}>
              {visible.map((ticket) => (
                <li key={ticket.id}>
                  <TicketRow
                    ticket={ticket}
                    now={now}
                    selected={ticket.id === selected?.id}
                    onSelect={() => {
                      setSelectedId(ticket.id);
                      setShowDetail(true);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className={styles.detail} aria-label="Handoff details">
          {selected ? (
            <TicketDetail
              ticket={selected}
              now={now}
              updating={updating === selected.id}
              onStatus={(status) => void setStatus(selected, status)}
              onBack={() => setShowDetail(false)}
            />
          ) : (
            tickets !== null && (
              <div className={styles.placeholder}>
                <p>Select a handoff to see what the customer already told Sterling.</p>
              </div>
            )
          )}
        </section>
      </main>
    </div>
  );
}
