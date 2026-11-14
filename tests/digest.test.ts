import { describe, expect, it } from "vitest";
import { type DigestRow, buildDigest, digestDayToSend, digestEntries } from "../src/lib/digest";
import { messages } from "../src/lib/i18n";
import { TZ, baku } from "./helpers";

const t = messages.en;

const rows: DigestRow[] = [
  { username: "aysel", name: "Aysel", weekdays: 0b111_1111, paused: 0, done_at: 1 },
  { username: "murad", name: "Murad", weekdays: 0b001_1111, paused: 0, done_at: null },
  { username: "nigar", name: null, weekdays: 0b111_1111, paused: 0, done_at: null },
  { username: "orxan", name: "Orxan", weekdays: 0b111_1111, paused: 1, done_at: null },
];

describe("digestEntries", () => {
  it("marks each mentee as done, missed or off for that day", () => {
    // 2026-11-14 is a Saturday, which Murad has turned off.
    expect(digestEntries(rows, "2026-11-14")).toEqual([
      { name: "Aysel", status: "done" },
      { name: "Murad", status: "off" },
      { name: "nigar", status: "missed" },
      { name: "Orxan", status: "off" },
    ]);
  });

  it("counts a day off as done when they wrote anyway", () => {
    const [entry] = digestEntries([{ ...rows[1]!, done_at: 1 }], "2026-11-14");
    expect(entry?.status).toBe("done");
  });
});

describe("buildDigest", () => {
  const entries = digestEntries(rows, "2026-11-14");

  it("sends nothing when off", () => {
    expect(buildDigest(entries, "off", t, "2026-11-14")).toBeNull();
  });

  it("sends nothing without mentees", () => {
    expect(buildDigest([], "names", t, "2026-11-14")).toBeNull();
  });

  it("shows counts without names", () => {
    expect(buildDigest(entries, "count", t, "2026-11-14")).toBe(
      "📊 Notes for 14.11.2026\n\n✍️ 1/2 wrote their notes.\n💤 2 had a day off.",
    );
  });

  it("lists names by status", () => {
    expect(buildDigest(entries, "names", t, "2026-11-14")).toBe(
      "📊 Notes for 14.11.2026\n\n✅ Wrote: Aysel\n⏳ Didn't write: nigar\n💤 Day off: Murad, Orxan",
    );
  });
});

describe("digestDayToSend", () => {
  it("waits until 10:00", () => {
    expect(digestDayToSend(baku("2026-11-15 09:59"), TZ, null)).toBeNull();
  });

  it("reports on the previous day from 10:00", () => {
    expect(digestDayToSend(baku("2026-11-15 10:00"), TZ, "2026-11-13")).toBe("2026-11-14");
  });

  it("sends only once per day", () => {
    expect(digestDayToSend(baku("2026-11-15 10:01"), TZ, "2026-11-14")).toBeNull();
  });

  it("does not fire after midnight before the next 10:00", () => {
    expect(digestDayToSend(baku("2026-11-16 02:00"), TZ, "2026-11-14")).toBeNull();
  });
});
