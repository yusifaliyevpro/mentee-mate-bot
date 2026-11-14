import {
  CATCH_UP_MINUTES,
  DAY_START_HOUR,
  NUDGE_AT,
  NUDGE_GAP_SECONDS,
  isActiveDay,
  localTime,
  logicalDay,
  unixSeconds,
} from "./time";

/** A mentee joined with their `days` row for the current logical day (nulls when there is none yet). */
export interface ScheduleRow {
  tg_id: number;
  remind_at: number;
  weekdays: number;
  paused: number;
  reminded_at: number | null;
  skipped_at: number | null;
  snooze_until: number | null;
  nudged_at: number | null;
  done_at: number | null;
}

export type ActionKind = "remind" | "snooze" | "nudge";

export interface Action<T extends ScheduleRow> {
  kind: ActionKind;
  row: T;
}

/** True when today's reminder time is already behind us, so a new or changed time shouldn't trigger a catch-up. */
export function reminderTimePassed(remindAt: number, now: Date, timeZone: string): boolean {
  const { minutes } = localTime(now, timeZone);
  return minutes >= DAY_START_HOUR * 60 && minutes > remindAt;
}

/** Decides which messages a single cron tick should send. At most one per mentee. */
export function planTick<T extends ScheduleRow>(rows: T[], now: Date, timeZone: string): Action<T>[] {
  const { minutes } = localTime(now, timeZone);
  const { weekday } = logicalDay(now, timeZone);
  const nowSeconds = unixSeconds(now);
  const afterDayStart = minutes >= DAY_START_HOUR * 60;
  const actions: Action<T>[] = [];

  for (const row of rows) {
    if (row.paused || row.done_at !== null || !isActiveDay(row.weekdays, weekday)) continue;

    if (row.snooze_until !== null && row.snooze_until <= nowSeconds) {
      actions.push({ kind: "snooze", row });
    } else if (
      afterDayStart &&
      row.reminded_at === null &&
      row.skipped_at === null &&
      minutes >= row.remind_at &&
      minutes < row.remind_at + CATCH_UP_MINUTES
    ) {
      actions.push({ kind: "remind", row });
    } else if (
      minutes >= NUDGE_AT &&
      row.nudged_at === null &&
      row.snooze_until === null &&
      // Only a reminder that was actually sent today earns a nudge.
      row.reminded_at !== null &&
      nowSeconds - row.reminded_at >= NUDGE_GAP_SECONDS
    ) {
      actions.push({ kind: "nudge", row });
    }
  }

  return actions;
}
