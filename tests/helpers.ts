import type { Member } from "../src/lib/db";
import type { ScheduleRow } from "../src/lib/schedule";
import { ALL_DAYS } from "../src/lib/time";

export const TZ = "Asia/Baku";

/** A Date for a Baku wall-clock time, e.g. `baku("2026-11-14 21:30")`. */
export function baku(local: string): Date {
  return new Date(`${local.replace(" ", "T")}:00+04:00`);
}

export function seconds(local: string): number {
  return Math.floor(baku(local).getTime() / 1000);
}

export function scheduleRow(overrides: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    tg_id: 1,
    remind_at: 21 * 60,
    weekdays: ALL_DAYS,
    paused: 0,
    reminded_at: null,
    snooze_until: null,
    nudged_at: null,
    done_at: null,
    ...overrides,
  };
}

export function member(overrides: Partial<Member> = {}): Member {
  return {
    username: "aysel",
    role: "mentee",
    tg_id: 1,
    name: "Aysel",
    remind_at: 21 * 60,
    weekdays: ALL_DAYS,
    message: null,
    paused: 0,
    awaiting: null,
    welcomed_role: null,
    ...overrides,
  };
}
