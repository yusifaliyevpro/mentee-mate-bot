import type { InlineKeyboard } from "grammy";
import { describe, expect, it } from "vitest";
import { normalizeUsername } from "../src/lib/db";
import { buildDigest, digestDayToSend } from "../src/lib/digest";
import { messages } from "../src/lib/i18n";
import { planTick, reminderTimePassed } from "../src/lib/schedule";
import { formatMinutes, isActiveDay, localTime, logicalDay, previousDay, weekdayOf } from "../src/lib/time";
import {
  adminKeyboard,
  adminText,
  daysKeyboard,
  displayName,
  hoursKeyboard,
  isPickerTime,
  membersText,
  messageKeyboard,
  minutesKeyboard,
  reminderKeyboard,
  settingsKeyboard,
} from "../src/lib/views";
import { TZ, baku, member, scheduleRow, seconds } from "./helpers";

const t = messages.en;

const entry = (name: string, status: "done" | "missed" | "off") => ({ name, status });

const kinds = (rows: ReturnType<typeof scheduleRow>[], local: string) =>
  planTick(rows, baku(local), TZ).map((action) => action.kind);

const callbackData = (keyboard: InlineKeyboard) =>
  keyboard.inline_keyboard.flat().map((button) => ("callback_data" in button ? button.callback_data : undefined));

describe("time", () => {
  it("handles leap days", () => {
    expect(previousDay("2028-03-01")).toBe("2028-02-29");
    expect(previousDay("2027-03-01")).toBe("2027-02-28");
    expect(weekdayOf("2028-02-29")).toBe(1);
  });

  it("puts the year boundary on the right logical day", () => {
    expect(logicalDay(baku("2027-01-01 03:30"), TZ).day).toBe("2026-12-31");
    expect(logicalDay(baku("2027-01-01 04:00"), TZ).day).toBe("2027-01-01");
  });

  it("gives every minute of a day exactly one local time", () => {
    const start = baku("2026-11-14 00:00").getTime();
    const minutes = Array.from({ length: 1440 }, (_, i) => localTime(new Date(start + i * 60_000), TZ).minutes);
    expect(minutes).toEqual(Array.from({ length: 1440 }, (_, i) => i));
  });

  it("ignores seconds", () => {
    expect(localTime(new Date("2026-11-14T17:30:59Z"), TZ).minutes).toBe(21 * 60 + 30);
  });

  it("works in other timezones, including across DST changes", () => {
    // Berlin switches from CEST (UTC+2) to CET (UTC+1) on 2026-10-25.
    expect(localTime(new Date("2026-10-24T19:00:00Z"), "Europe/Berlin").minutes).toBe(21 * 60);
    expect(localTime(new Date("2026-10-26T20:00:00Z"), "Europe/Berlin").minutes).toBe(21 * 60);
    expect(logicalDay(new Date("2026-10-26T01:30:00Z"), "Europe/Berlin").day).toBe("2026-10-25");
  });

  it("formats midnight and the last minute", () => {
    expect(formatMinutes(0)).toBe("00:00");
    expect(formatMinutes(1439)).toBe("23:59");
  });

  it("checks every weekday bit", () => {
    for (let day = 0; day < 7; day++) {
      expect(isActiveDay(0b111_1111, day)).toBe(true);
      expect(isActiveDay(0, day)).toBe(false);
      expect(isActiveDay(1 << day, day)).toBe(true);
    }
  });
});

describe("planTick with several mentees", () => {
  it("decides for each one independently", () => {
    const rows = [
      scheduleRow({ tg_id: 1 }),
      scheduleRow({ tg_id: 2, remind_at: 20 * 60 }),
      scheduleRow({ tg_id: 3, paused: 1 }),
      scheduleRow({ tg_id: 4, snooze_until: seconds("2026-11-14 21:00"), reminded_at: seconds("2026-11-14 20:30") }),
    ];
    const actions = planTick(rows, baku("2026-11-14 21:00"), TZ).map(({ kind, row }) => [row.tg_id, kind]);
    expect(actions).toEqual([
      [1, "remind"],
      [4, "snooze"],
    ]);
  });

  it("returns the original rows so callers keep extra fields", () => {
    const row = { ...scheduleRow(), message: "custom" };
    expect(planTick([row], baku("2026-11-14 21:00"), TZ)[0]?.row.message).toBe("custom");
  });
});

describe("planTick around midnight", () => {
  it("uses the logical day's weekday after midnight", () => {
    // Saturday off: at Sunday 00:30 it's still Saturday, so the snooze is dropped.
    const saturdayOff = scheduleRow({ weekdays: 0b101_1111, snooze_until: seconds("2026-11-15 00:30") });
    expect(kinds([saturdayOff], "2026-11-15 00:30")).toEqual([]);
    // Saturday only: same moment, so it fires.
    const saturdayOnly = scheduleRow({ weekdays: 0b010_0000, snooze_until: seconds("2026-11-15 00:30") });
    expect(kinds([saturdayOnly], "2026-11-15 00:30")).toEqual(["snooze"]);
  });

  it("never sends regular reminders between midnight and 04:00", () => {
    for (const local of ["2026-11-15 00:00", "2026-11-15 01:00", "2026-11-15 03:59"]) {
      expect(kinds([scheduleRow({ remind_at: 0 })], local)).toEqual([]);
    }
  });

  it("does not nudge after midnight", () => {
    expect(kinds([scheduleRow({ reminded_at: seconds("2026-11-14 21:00") })], "2026-11-15 00:00")).toEqual([]);
  });
});

describe("planTick priorities", () => {
  it("prefers a due snooze over the nudge", () => {
    const row = scheduleRow({ reminded_at: seconds("2026-11-14 21:00"), snooze_until: seconds("2026-11-14 23:50") });
    expect(kinds([row], "2026-11-14 23:50")).toEqual(["snooze"]);
  });

  it("sends the nudge exactly one hour after the last reminder", () => {
    const row = scheduleRow({ reminded_at: seconds("2026-11-14 22:50") });
    expect(kinds([row], "2026-11-14 23:50")).toEqual(["nudge"]);
    const later = scheduleRow({ reminded_at: seconds("2026-11-14 22:51") });
    expect(kinds([later], "2026-11-14 23:50")).toEqual([]);
  });

  it("does nothing when every weekday is off", () => {
    expect(kinds([scheduleRow({ weekdays: 0 })], "2026-11-14 21:00")).toEqual([]);
    expect(kinds([scheduleRow({ weekdays: 0 })], "2026-11-14 23:50")).toEqual([]);
  });
});

describe("reminderTimePassed", () => {
  it("treats 04:00 as the start of a new day", () => {
    expect(reminderTimePassed(6 * 60, baku("2026-11-15 04:00"), TZ)).toBe(false);
    expect(reminderTimePassed(3 * 60, baku("2026-11-15 04:00"), TZ)).toBe(true);
  });
});

describe("buildDigest variations", () => {
  it("omits empty groups", () => {
    expect(buildDigest([entry("A", "done"), entry("B", "done")], "names", t, "2026-11-14")).toBe(
      "📊 Notes for 14.11.2026\n\n✅ Wrote: A, B",
    );
  });

  it("leaves out the day-off line in count mode when nobody had one", () => {
    expect(buildDigest([entry("A", "done"), entry("B", "missed")], "count", t, "2026-11-14")).toBe(
      "📊 Notes for 14.11.2026\n\n✍️ 1/2 wrote their notes.",
    );
  });

  it("handles everyone being off", () => {
    expect(buildDigest([entry("A", "off")], "count", t, "2026-11-14")).toBe(
      "📊 Notes for 14.11.2026\n\n✍️ 0/0 wrote their notes.\n💤 1 had a day off.",
    );
  });

  it("is written in Azerbaijani too", () => {
    expect(buildDigest([entry("A", "done"), entry("B", "missed")], "count", messages.az, "2026-11-14")).toBe(
      "📊 14.11.2026 tarixli qeydlər\n\n✍️ 2 nəfərdən 1 nəfər qeydlərini yazıb.",
    );
  });

  it("keeps the order it was given", () => {
    expect(buildDigest([entry("Zaur", "done"), entry("Aysel", "done")], "names", t, "2026-11-14")).toContain(
      "Zaur, Aysel",
    );
  });
});

describe("digestDayToSend", () => {
  it("reports on the last day of the previous month", () => {
    expect(digestDayToSend(baku("2026-12-01 10:00"), TZ, null)).toBe("2026-11-30");
  });

  it("still sends late in the evening if the morning was missed", () => {
    expect(digestDayToSend(baku("2026-11-15 23:59"), TZ, "2026-11-13")).toBe("2026-11-14");
  });
});

describe("callback data", () => {
  it("fits Telegram's 64-byte limit on every keyboard", () => {
    const keyboards = [
      reminderKeyboard(t, "2026-11-14"),
      hoursKeyboard(t),
      minutesKeyboard(t, 23),
      daysKeyboard(t, 0),
      messageKeyboard(t),
      settingsKeyboard(t, member()),
      adminKeyboard(t, { lang: "az", digestMode: "names", digestSentDay: null }),
    ];
    for (const data of keyboards.flatMap(callbackData)) {
      expect(new TextEncoder().encode(data).length).toBeLessThanOrEqual(64);
    }
  });

  it("offers only valid times in the minute picker", () => {
    for (const hour of [6, 12, 23]) {
      const times = callbackData(minutesKeyboard(t, hour))
        .filter((data) => data?.startsWith("s:t:"))
        .map((data) => Number(data?.slice(4)));
      expect(times).toHaveLength(4);
      expect(times.every(isPickerTime)).toBe(true);
    }
  });
});

describe("views", () => {
  it("offers Pause when active and Resume when paused", () => {
    expect(callbackData(settingsKeyboard(t, member()))).toContain("s:pause");
    expect(callbackData(settingsKeyboard(t, member({ paused: 1 })))).toContain("s:resume");
  });

  it("marks the current language and summary mode", () => {
    const labels = adminKeyboard(t, { lang: "en", digestMode: "count", digestSentDay: null })
      .inline_keyboard.flat()
      .map((button) => button.text);
    expect(labels).toEqual(["🇦🇿 Azərbaycanca", "● 🇬🇧 English", "Off", "● Count only", "With names"]);
  });

  it("summarizes the mentor and mentee count", () => {
    const text = adminText(t, [
      member(),
      member({ username: "murad", name: "Murad" }),
      member({ username: "leyla", name: "Leyla", role: "mentor" }),
    ]);
    expect(text).toContain("Mentor: Leyla (@leyla)");
    expect(text).toContain("Mentees: 2");
  });

  it("says when no mentor is set", () => {
    expect(adminText(t, [member()])).toContain("Mentor: not set");
  });

  it("shows the empty state for /members", () => {
    expect(membersText(t, [])).toBe(t.noMembers);
  });

  it("shows a member without a name by username", () => {
    expect(displayName(member({ name: null }))).toBe("@aysel");
  });
});

describe("i18n content", () => {
  const sample = (value: unknown): string[] => {
    if (typeof value === "string") return [value];
    // Functions take a name, a number or a list of names; one of these shapes fits each.
    if (typeof value === "function") return [String(value.length === 2 ? value(1, 2) : value(["X", "Y"]))];
    if (Array.isArray(value)) return value.map(String);
    if (value && typeof value === "object") return Object.values(value).flatMap(sample);
    return [];
  };

  for (const lang of ["az", "en"] as const) {
    it(`has no empty or broken strings in ${lang}`, () => {
      for (const text of sample(messages[lang])) {
        expect(text.trim()).not.toBe("");
        expect(text).not.toContain("undefined");
        expect(text).not.toContain("NaN");
      }
    });

    it(`keeps command descriptions within Telegram's limits in ${lang}`, () => {
      for (const description of Object.values(messages[lang].commands)) {
        expect(description.length).toBeGreaterThanOrEqual(1);
        expect(description.length).toBeLessThanOrEqual(256);
      }
    });

    it(`makes clear that 04:00 is at night in ${lang}`, () => {
      const mentions = sample(messages[lang]).filter((text) => /04:00|4 AM/.test(text));
      const atNight = lang === "az" ? "gecə saat 04:00" : "4 AM";
      expect(mentions.length).toBeGreaterThanOrEqual(5);
      for (const text of mentions) expect(text).toContain(atNight);
    });

    it(`explains when a day ends when a tap comes too late in ${lang}`, () => {
      expect(messages[lang].dayOver).toMatch(lang === "az" ? /gecə saat 04:00/ : /4 AM/);
    });

    it(`has unique weekday labels in ${lang}`, () => {
      expect(new Set(messages[lang].weekdays).size).toBe(7);
    });
  }
});

describe("usernames", () => {
  it("accepts 4 to 32 characters", () => {
    expect(normalizeUsername("abcd")).toBe("abcd");
    expect(normalizeUsername("a".repeat(32))).toBe("a".repeat(32));
    expect(normalizeUsername("a".repeat(33))).toBeNull();
  });

  it("trims whitespace and rejects empty input", () => {
    expect(normalizeUsername("  @murad_k  ")).toBe("murad_k");
    expect(normalizeUsername("")).toBeNull();
    expect(normalizeUsername("@")).toBeNull();
  });
});
