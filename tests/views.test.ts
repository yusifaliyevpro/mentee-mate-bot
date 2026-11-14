import type { InlineKeyboard } from "grammy";
import { describe, expect, it } from "vitest";
import { normalizeUsername } from "../src/lib/db";
import { messages } from "../src/lib/i18n";
import {
  daysKeyboard,
  displayName,
  hoursKeyboard,
  isPickerTime,
  membersText,
  reminderKeyboard,
  settingsText,
} from "../src/lib/views";
import { member } from "./helpers";

const t = messages.en;

const callbackData = (keyboard: InlineKeyboard) =>
  keyboard.inline_keyboard.flat().map((button) => ("callback_data" in button ? button.callback_data : undefined));

describe("i18n", () => {
  it("has the same keys in both languages", () => {
    expect(Object.keys(messages.az).toSorted()).toEqual(Object.keys(messages.en).toSorted());
    expect(Object.keys(messages.az.commands).toSorted()).toEqual(Object.keys(messages.en.commands).toSorted());
  });

  it("has seven weekdays in both languages", () => {
    expect(messages.az.weekdays).toHaveLength(7);
    expect(messages.en.weekdays).toHaveLength(7);
  });
});

describe("reminderKeyboard", () => {
  it("carries the day so a late tap counts for the right day", () => {
    expect(callbackData(reminderKeyboard(t, "2026-11-14"))).toEqual([
      "done:2026-11-14",
      "snooze:30:2026-11-14",
      "snooze:60:2026-11-14",
    ]);
  });
});

describe("settingsText", () => {
  it("shows defaults, spelling out the default reminder text", () => {
    expect(settingsText(t, member())).toBe(
      `⚙️ Your settings\n\n⏰ Time: 21:00\n📅 Days: every day\n💬 Message: ${t.defaultReminder}\nStatus: ▶️ active`,
    );
  });

  it("numbers the days in Azerbaijani, as people usually say them", () => {
    expect(messages.az.weekdays).toEqual([
      "1-ci gün",
      "2-ci gün",
      "3-cü gün",
      "4-cü gün",
      "5-ci gün",
      "6-cı gün",
      "7-ci gün",
    ]);
    expect(settingsText(messages.az, member({ weekdays: 0b001_0101 }))).toContain(
      "📅 Günlər: 1-ci gün, 3-cü gün, 5-ci gün",
    );
  });

  it("shows the default text in Azerbaijani too", () => {
    expect(settingsText(messages.az, member())).toContain(`💬 Mətn: ${messages.az.defaultReminder}`);
    expect(settingsText(messages.az, member())).not.toContain("standart");
  });

  it("lists selected days and custom text", () => {
    const text = settingsText(t, member({ weekdays: 0b000_0101, message: "Write!", paused: 1 }));
    expect(text).toContain("📅 Days: Mon, Wed");
    expect(text).toContain("💬 Message: Write!");
    expect(text).toContain("⏸ paused");
  });
});

describe("pickers", () => {
  it("offers hours from 06 to 23", () => {
    const data = callbackData(hoursKeyboard(t));
    expect(data[0]).toBe("s:h:6");
    expect(data).toContain("s:h:23");
    expect(data).not.toContain("s:h:5");
  });

  it("only accepts times from the picker", () => {
    expect(isPickerTime(21 * 60 + 30)).toBe(true);
    expect(isPickerTime(23 * 60 + 45)).toBe(true);
    expect(isPickerTime(21 * 60 + 10)).toBe(false);
    expect(isPickerTime(3 * 60)).toBe(false);
  });

  it("marks active days", () => {
    const labels = daysKeyboard(t, 0b000_0001)
      .inline_keyboard.flat()
      .map((button) => button.text);
    expect(labels[0]).toBe("✅ Mon");
    expect(labels[1]).toBe("▫️ Tue");
  });
});

describe("usernames", () => {
  it("normalizes @ and case", () => {
    expect(normalizeUsername("@Aysel_M")).toBe("aysel_m");
  });

  it("rejects invalid usernames", () => {
    expect(normalizeUsername("@no")).toBeNull();
    expect(normalizeUsername("bad-name")).toBeNull();
  });
});

describe("members", () => {
  it("shows who hasn't started yet", () => {
    expect(membersText(t, [member({ role: "mentor", username: "mentor1", name: null, tg_id: null })])).toBe(
      "👥 Members\n\n• @mentor1 (mentor, hasn't pressed Start yet)",
    );
  });

  it("hides the id placeholder for an admin without a username", () => {
    expect(displayName(member({ username: "id:42", name: "Yusif" }))).toBe("Yusif");
  });
});
