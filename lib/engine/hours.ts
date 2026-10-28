/**
 * Business-hours awareness for escalation: "an advisor can call you now" vs
 * "we'll call you next business day" depends on New York time, not the server's.
 */
import { SBG } from "@/lib/sbg/company";

export interface HoursStatus {
  open: boolean;
  /** e.g. "Advisors are available now" / "Back Monday at 9am ET" */
  label: string;
  /** Formatted Eastern time, e.g. "Wednesday 6:42 PM ET" - given to the model as context. */
  nowLabel: string;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function easternParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SBG.hours.timeZone, weekday: "short", hour: "numeric", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { weekday, hour: Number(get("hour")), minute: Number(get("minute")) };
}

export function hoursStatus(date = new Date()): HoursStatus {
  const { weekday, hour, minute } = easternParts(date);
  const { openHour, closeHour, weekdays } = SBG.hours;
  const isWorkday = (weekdays as readonly number[]).includes(weekday);
  const open = isWorkday && hour >= openHour && hour < closeHour;

  const time12 = `${((hour + 11) % 12) + 1}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
  const nowLabel = `${WEEKDAYS[weekday]} ${time12} ET`;
  if (open) return { open, label: "Advisors are available now", nowLabel };

  // Next opening: later today if before 9am on a workday, otherwise the next workday.
  let next = weekday;
  if (!(isWorkday && hour < openHour)) {
    do { next = (next + 1) % 7; } while (!(weekdays as readonly number[]).includes(next));
  }
  const day = next === weekday ? "today" : next === (weekday + 1) % 7 ? "tomorrow" : WEEKDAYS[next];
  return { open, label: `Back ${day} at ${openHour}am ET`, nowLabel };
}
