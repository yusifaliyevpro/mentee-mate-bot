// A day runs 04:00 → 04:00, so notes written after midnight still count for the previous day.
export const DAY_START_HOUR = 4;
export const NUDGE_AT = 23 * 60 + 50;
export const DIGEST_AT = 10 * 60;
// Cron runs can be skipped or delayed, so a reminder may still go out a few minutes late.
export const CATCH_UP_MINUTES = 15;
export const NUDGE_GAP_SECONDS = 60 * 60;
export const ALL_DAYS = 0b111_1111;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export interface LocalTime {
  /** Calendar date, `YYYY-MM-DD`. */
  date: string;
  /** Minutes since local midnight. */
  minutes: number;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
}

export function localTime(at: Date, timeZone: string): LocalTime {
  const parts: Record<string, string> = {};
  for (const part of formatterFor(timeZone).formatToParts(at)) parts[part.type] = part.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday ?? ""),
  };
}

export function logicalDay(at: Date, timeZone: string): { day: string; weekday: number } {
  const shifted = localTime(new Date(at.getTime() - DAY_START_HOUR * 3_600_000), timeZone);
  return { day: shifted.date, weekday: shifted.weekday };
}

export function previousDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function weekdayOf(day: string): number {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function isActiveDay(mask: number, weekday: number): boolean {
  return ((mask >> weekday) & 1) === 1;
}

export function toggleDay(mask: number, weekday: number): number {
  return mask ^ (1 << weekday);
}

export function formatMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function formatDay(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date}.${month}.${year}`;
}

export function unixSeconds(at: Date): number {
  return Math.floor(at.getTime() / 1000);
}
