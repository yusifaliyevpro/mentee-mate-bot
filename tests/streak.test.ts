import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "../src/lib/i18n";
import { type StreakDay, streak } from "../src/lib/streak";
import { seconds } from "./helpers";
import { ADMIN, AYSEL, Harness } from "./support/harness";

const az = messages.az;
const en = messages.en;

const reminded = (day: string): StreakDay => ({ day, reminded_at: seconds(`${day} 21:00`), done_at: null });
const done = (day: string): StreakDay => ({ ...reminded(day), done_at: seconds(`${day} 21:30`) });
const doneEarly = (day: string): StreakDay => ({ day, reminded_at: null, done_at: seconds(`${day} 18:00`) });

describe("streak", () => {
  it("is 0 with no history", () => {
    expect(streak([])).toBe(0);
  });

  it("counts consecutive written days", () => {
    expect(streak([done("2026-11-13"), done("2026-11-12"), done("2026-11-11")])).toBe(3);
  });

  it("stops at a reminded day that wasn't written", () => {
    expect(streak([done("2026-11-13"), reminded("2026-11-12"), done("2026-11-11")])).toBe(1);
  });

  it("is 0 when yesterday was missed", () => {
    expect(streak([reminded("2026-11-13"), done("2026-11-12")])).toBe(0);
  });

  it("counts a day marked with /done before any reminder", () => {
    expect(streak([doneEarly("2026-11-13"), done("2026-11-12")])).toBe(2);
  });

  it("skips gaps with no reminder (days off, paused, joined later)", () => {
    expect(streak([done("2026-11-13"), done("2026-11-10")])).toBe(2);
  });

  it("doesn't depend on the input order", () => {
    expect(streak([done("2026-11-11"), reminded("2026-11-12"), done("2026-11-13")])).toBe(1);
  });
});

describe("streak in the 23:50 nudge", () => {
  let h: Harness;

  const write = async (day: string) => {
    await h.tick(`${day} 21:00`);
    h.at(`${day} 21:10`);
    await h.send(AYSEL, "/done");
  };
  const skip = (day: string) => h.tick(`${day} 21:00`);
  const nudgeOn = async (day: string) => {
    await h.tick(`${day} 21:00`);
    h.telegram.clear();
    await h.tick(`${day} 23:50`);
    return h.telegram.sentTo(AYSEL.id);
  };

  beforeEach(async () => {
    h = await Harness.create("2026-11-10 12:00");
    await h.onboard(AYSEL);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the streak after several written days", async () => {
    await write("2026-11-10");
    await write("2026-11-11");
    await write("2026-11-12");
    expect(await nudgeOn("2026-11-13")).toEqual([`${az.nudge}\n\n${az.nudgeStreak(3)}`]);
  });

  it("is left out for a single written day", async () => {
    await write("2026-11-12");
    expect(await nudgeOn("2026-11-13")).toEqual([az.nudge]);
  });

  it("is left out after a missed day", async () => {
    await write("2026-11-10");
    await write("2026-11-11");
    await skip("2026-11-12");
    expect(await nudgeOn("2026-11-13")).toEqual([az.nudge]);
  });

  it("counts a note written after midnight for the previous day", async () => {
    await write("2026-11-11");
    await h.tick("2026-11-12 21:00");
    h.at("2026-11-13 01:30");
    await h.send(AYSEL, "/done");
    expect(await nudgeOn("2026-11-13")).toEqual([`${az.nudge}\n\n${az.nudgeStreak(2)}`]);
  });

  it("survives a day off", async () => {
    await write("2026-11-10");
    await write("2026-11-11");
    // Thursday (index 3) off: no reminder that day, so it doesn't break the streak.
    h.db.exec(`UPDATE members SET weekdays = 119 WHERE tg_id = ${AYSEL.id}`);
    await h.tick("2026-11-12 21:00");
    h.db.exec(`UPDATE members SET weekdays = 127 WHERE tg_id = ${AYSEL.id}`);
    expect(await nudgeOn("2026-11-13")).toEqual([`${az.nudge}\n\n${az.nudgeStreak(2)}`]);
  });

  it("survives a pause", async () => {
    await write("2026-11-10");
    await write("2026-11-11");
    await h.send(AYSEL, "/pause");
    await h.tick("2026-11-12 21:00");
    await h.send(AYSEL, "/resume");
    expect(await nudgeOn("2026-11-13")).toEqual([`${az.nudge}\n\n${az.nudgeStreak(2)}`]);
  });

  it("an /undone day breaks it", async () => {
    await write("2026-11-10");
    await write("2026-11-11");
    await write("2026-11-12");
    await h.send(AYSEL, "/undone");
    expect(await nudgeOn("2026-11-13")).toEqual([az.nudge]);
  });

  it("is in English when the bot is", async () => {
    await h.send(ADMIN, "/admin");
    await h.tap(ADMIN, "a:lang:en");
    await write("2026-11-11");
    await write("2026-11-12");
    expect(await nudgeOn("2026-11-13")).toEqual([`${en.nudge}\n\n${en.nudgeStreak(2)}`]);
  });

  it("is per mentee", async () => {
    await write("2026-11-11");
    await write("2026-11-12");
    await h.tick("2026-11-13 21:00");
    h.telegram.clear();
    await h.tick("2026-11-13 23:50");
    expect(h.telegram.sentTo(ADMIN.id)).toEqual([az.nudge]);
  });
});
