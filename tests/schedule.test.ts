import { describe, expect, it } from "vitest";
import { planTick } from "../src/lib/schedule";
import { TZ, baku, scheduleRow, seconds } from "./helpers";

const kinds = (rows: ReturnType<typeof scheduleRow>[], local: string) =>
  planTick(rows, baku(local), TZ).map((action) => action.kind);

describe("planTick reminders", () => {
  it("reminds at the chosen time", () => {
    expect(kinds([scheduleRow()], "2026-11-14 21:00")).toEqual(["remind"]);
  });

  it("does nothing before the chosen time", () => {
    expect(kinds([scheduleRow()], "2026-11-14 20:59")).toEqual([]);
  });

  it("catches up on a missed cron run, but only briefly", () => {
    expect(kinds([scheduleRow()], "2026-11-14 21:14")).toEqual(["remind"]);
    expect(kinds([scheduleRow()], "2026-11-14 21:15")).toEqual([]);
  });

  it("reminds only once a day", () => {
    expect(kinds([scheduleRow({ reminded_at: seconds("2026-11-14 21:00") })], "2026-11-14 21:01")).toEqual([]);
  });

  it("skips paused mentees, finished days and days off", () => {
    expect(kinds([scheduleRow({ paused: 1 })], "2026-11-14 21:00")).toEqual([]);
    expect(kinds([scheduleRow({ done_at: seconds("2026-11-14 19:00") })], "2026-11-14 21:00")).toEqual([]);
    // 2026-11-14 is a Saturday (bit 5).
    expect(kinds([scheduleRow({ weekdays: 0b001_1111 })], "2026-11-14 21:00")).toEqual([]);
  });
});

describe("planTick snoozes", () => {
  it("fires a snooze once it is due", () => {
    const row = scheduleRow({ reminded_at: seconds("2026-11-14 21:00"), snooze_until: seconds("2026-11-14 21:30") });
    expect(kinds([row], "2026-11-14 21:29")).toEqual([]);
    expect(kinds([row], "2026-11-14 21:30")).toEqual(["snooze"]);
  });

  it("fires a snooze after midnight on the same logical day", () => {
    const row = scheduleRow({ nudged_at: seconds("2026-11-14 23:50"), snooze_until: seconds("2026-11-15 00:20") });
    expect(kinds([row], "2026-11-15 00:20")).toEqual(["snooze"]);
  });
});

describe("planTick nudge", () => {
  it("nudges at 23:50 when not done", () => {
    expect(kinds([scheduleRow({ reminded_at: seconds("2026-11-14 21:00") })], "2026-11-14 23:50")).toEqual(["nudge"]);
  });

  it("nudges only once", () => {
    const row = scheduleRow({ reminded_at: seconds("2026-11-14 21:00"), nudged_at: seconds("2026-11-14 23:50") });
    expect(kinds([row], "2026-11-14 23:51")).toEqual([]);
  });

  it("skips the nudge right after a late reminder", () => {
    const row = scheduleRow({ remind_at: 23 * 60 + 15, reminded_at: seconds("2026-11-14 23:15") });
    expect(kinds([row], "2026-11-14 23:50")).toEqual([]);
  });

  it("skips the nudge while a snooze is pending", () => {
    const row = scheduleRow({ reminded_at: seconds("2026-11-14 21:00"), snooze_until: seconds("2026-11-15 00:10") });
    expect(kinds([row], "2026-11-14 23:50")).toEqual([]);
  });

  it("does not nudge on a day off", () => {
    expect(kinds([scheduleRow({ weekdays: 0b001_1111 })], "2026-11-14 23:50")).toEqual([]);
  });
});
