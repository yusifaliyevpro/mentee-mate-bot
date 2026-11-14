import type { Messages } from "./i18n";
import { DIGEST_AT, formatDay, isActiveDay, localTime, previousDay, weekdayOf } from "./time";

export type DigestMode = "off" | "count" | "names";
export const DIGEST_MODES: DigestMode[] = ["off", "count", "names"];

export type DigestStatus = "done" | "missed" | "off";

export interface DigestRow {
  username: string;
  name: string | null;
  weekdays: number;
  paused: number;
  reminded_at: number | null;
  done_at: number | null;
}

export interface DigestEntry {
  name: string;
  status: DigestStatus;
}

export function isDigestMode(value: string | undefined): value is DigestMode {
  return value === "off" || value === "count" || value === "names";
}

/** The day to report on if the summary is due now, otherwise `null`. */
export function digestDayToSend(now: Date, timeZone: string, lastSentDay: string | null): string | null {
  const { date, minutes } = localTime(now, timeZone);
  if (minutes < DIGEST_AT) return null;
  const day = previousDay(date);
  return day === lastSentDay ? null : day;
}

// Paused is the current state, not the state on `day`; close enough for a daily summary.
export function digestEntries(rows: DigestRow[], day: string): DigestEntry[] {
  const weekday = weekdayOf(day);
  return rows.flatMap((row): DigestEntry[] => {
    const name = row.name ?? row.username;
    if (row.done_at !== null) return [{ name, status: "done" }];
    if (row.paused || !isActiveDay(row.weekdays, weekday)) return [{ name, status: "off" }];
    // Nobody can be blamed for a day they were never reminded about, so they don't count at all.
    if (row.reminded_at === null) return [];
    return [{ name, status: "missed" }];
  });
}

export function buildDigest(entries: DigestEntry[], mode: DigestMode, t: Messages, day: string): string | null {
  if (mode === "off" || entries.length === 0) return null;

  const names = (status: DigestStatus) => entries.filter((entry) => entry.status === status).map((entry) => entry.name);
  const done = names("done");
  const missed = names("missed");
  const off = names("off");
  const lines = [t.digestTitle(formatDay(day)), ""];

  if (mode === "count") {
    lines.push(t.digestCount(done.length, done.length + missed.length));
    if (off.length > 0) lines.push(t.digestOffCount(off.length));
  } else {
    if (done.length > 0) lines.push(`${t.digestDone}: ${done.join(", ")}`);
    if (missed.length > 0) lines.push(`${t.digestMissed}: ${missed.join(", ")}`);
    if (off.length > 0) lines.push(`${t.digestOff}: ${off.join(", ")}`);
  }

  return lines.join("\n");
}
