import { describe, expect, it } from "vitest";
import {
  formatDay,
  formatMinutes,
  isActiveDay,
  localTime,
  logicalDay,
  previousDay,
  toggleDay,
  weekdayOf,
} from "../src/lib/time";
import { TZ, baku } from "./helpers";

describe("localTime", () => {
  it("converts to Baku wall-clock time", () => {
    expect(localTime(new Date("2026-11-14T17:30:00Z"), TZ)).toEqual({ date: "2026-11-14", minutes: 21 * 60 + 30, weekday: 5 });
  });

  it("handles midnight as hour 0", () => {
    expect(localTime(baku("2026-11-15 00:05"), TZ).minutes).toBe(5);
  });
});

describe("logicalDay", () => {
  it("keeps the previous day until 04:00", () => {
    expect(logicalDay(baku("2026-11-15 01:30"), TZ)).toEqual({ day: "2026-11-14", weekday: 5 });
    expect(logicalDay(baku("2026-11-15 03:59"), TZ).day).toBe("2026-11-14");
  });

  it("starts a new day at 04:00", () => {
    expect(logicalDay(baku("2026-11-15 04:00"), TZ)).toEqual({ day: "2026-11-15", weekday: 6 });
  });
});

describe("date helpers", () => {
  it("goes back across month and year boundaries", () => {
    expect(previousDay("2026-12-01")).toBe("2026-11-30");
    expect(previousDay("2027-01-01")).toBe("2026-12-31");
  });

  it("returns Monday-based weekdays", () => {
    expect(weekdayOf("2026-11-16")).toBe(0);
    expect(weekdayOf("2026-11-15")).toBe(6);
  });

  it("toggles weekday bits", () => {
    const withoutSaturday = toggleDay(0b111_1111, 5);
    expect(isActiveDay(withoutSaturday, 5)).toBe(false);
    expect(isActiveDay(withoutSaturday, 4)).toBe(true);
    expect(toggleDay(withoutSaturday, 5)).toBe(0b111_1111);
  });

  it("formats times and dates", () => {
    expect(formatMinutes(6 * 60 + 5)).toBe("06:05");
    expect(formatDay("2026-11-14")).toBe("14.11.2026");
  });
});
