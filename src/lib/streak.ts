export interface StreakDay {
  day: string;
  reminded_at: number | null;
  done_at: number | null;
}

/** A streak is shown in the nudge only from this many days. */
export const MIN_STREAK = 2;

/**
 * Counts consecutive written days, newest first. Only a day that got a reminder and wasn't written
 * breaks it; days off, paused days and days with no reminder are skipped.
 */
export function streak(days: StreakDay[]): number {
  let count = 0;
  for (const day of days.toSorted((a, b) => b.day.localeCompare(a.day))) {
    if (day.done_at !== null) count++;
    else if (day.reminded_at !== null) break;
  }
  return count;
}
