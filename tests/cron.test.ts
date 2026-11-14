import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "../src/lib/i18n";
import { seconds } from "./helpers";
import { buttonData, buttonLabels } from "./support/fake-telegram";
import { ADMIN, AYSEL, Harness, MENTOR, MURAD, NIGAR } from "./support/harness";

const az = messages.az;
const en = messages.en;

let h: Harness;

beforeEach(async () => {
  h = await Harness.create("2026-11-14 12:00");
  await h.onboard(AYSEL);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("daily reminder", () => {
  it("is sent at the chosen time with Done and snooze buttons for today", async () => {
    await h.tick("2026-11-14 21:00");
    const [reminder] = h.telegram.messagesTo(AYSEL.id);
    expect(reminder).toMatchObject({ chat_id: AYSEL.id, text: az.defaultReminder });
    expect(buttonData(reminder?.reply_markup)).toEqual([
      "done:2026-11-14",
      "snooze:30:2026-11-14",
      "snooze:60:2026-11-14",
    ]);
    expect(buttonLabels(reminder?.reply_markup)).toEqual([az.btnDone, az.btnSnooze(30), az.btnSnooze(60)]);
    expect(h.day(AYSEL, "2026-11-14")?.reminded_at).toBe(seconds("2026-11-14 21:00"));
  });

  it("is not sent a minute early", async () => {
    await h.tick("2026-11-14 20:59");
    expect(h.telegram.callsTo("sendMessage")).toEqual([]);
  });

  it("is sent once even though the cron runs every minute", async () => {
    await h.tickEveryMinute("2026-11-14 20:55", "2026-11-14 21:30");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.defaultReminder]);
  });

  it("is sent late if the cron skipped the exact minute", async () => {
    await h.tick("2026-11-14 21:07");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.defaultReminder]);
  });

  it("gives up after 15 minutes of missed cron runs", async () => {
    await h.tick("2026-11-14 21:15");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([]);
  });

  it("is sent again the next day", async () => {
    await h.tick("2026-11-14 21:00");
    await h.tick("2026-11-15 21:00");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.defaultReminder, az.defaultReminder]);
    expect(buttonData(h.telegram.messagesTo(AYSEL.id)[1]?.reply_markup)[0]).toBe("done:2026-11-15");
  });

  it("works at the earliest and latest picker times", async () => {
    await h.tap(AYSEL, "s:t:360");
    await h.tick("2026-11-15 06:00");
    await h.tap(AYSEL, "s:t:1425");
    await h.tick("2026-11-16 23:45");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.defaultReminder, az.defaultReminder]);
  });

  it("uses each mentee's own time", async () => {
    await h.onboard(MURAD, NIGAR);
    h.at("2026-11-14 12:00");
    await h.tap(MURAD, "s:t:1200");
    await h.tap(NIGAR, "s:t:1380");
    h.telegram.clear();

    await h.tick("2026-11-14 20:00");
    expect(h.telegram.recipients(ADMIN.id)).toEqual([MURAD.id]);
    h.telegram.clear();
    await h.tick("2026-11-14 21:00");
    expect(h.telegram.recipients(ADMIN.id)).toEqual([AYSEL.id]);
    h.telegram.clear();
    await h.tick("2026-11-14 23:00");
    expect(h.telegram.recipients(ADMIN.id)).toEqual([NIGAR.id]);
  });

  it("follows the bot language", async () => {
    await h.tap(ADMIN, "a:lang:en");
    h.telegram.clear();
    await h.tick("2026-11-14 21:00");
    const [reminder] = h.telegram.callsTo("sendMessage");
    expect(reminder?.text).toBe(en.defaultReminder);
    expect(buttonLabels(reminder?.reply_markup)).toEqual([en.btnDone, en.btnSnooze(30), en.btnSnooze(60)]);
  });

  it("skips mentees who haven't pressed Start", async () => {
    await h.send(ADMIN, "/allow @murad_k");
    h.telegram.clear();
    await h.tick("2026-11-14 21:00");
    expect(h.telegram.recipients(ADMIN.id)).toEqual([AYSEL.id]);
  });

  it("skips paused mentees and resumes the next day", async () => {
    await h.send(AYSEL, "/pause");
    await h.tick("2026-11-14 21:00");
    await h.send(AYSEL, "/resume");
    h.telegram.clear();
    await h.tick("2026-11-15 21:00");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.defaultReminder]);
  });

  it("follows the weekday choice across a whole week", async () => {
    // Weekdays only. 2026-11-16 is a Monday.
    await h.tap(AYSEL, "s:d:5");
    await h.tap(AYSEL, "s:d:6");
    h.telegram.clear();
    const sent: string[] = [];
    for (let date = 16; date <= 22; date++) {
      const day = `2026-11-${date}`;
      await h.tick(`${day} 21:00`);
      if (h.day(AYSEL, day)?.reminded_at) sent.push(day);
    }
    expect(sent).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]);
  });
});

describe("snooze", () => {
  it("re-sends the reminder when it's due, with fresh buttons", async () => {
    await h.tick("2026-11-14 21:00");
    h.at("2026-11-14 21:00");
    await h.tap(AYSEL, "snooze:30:2026-11-14");
    h.telegram.clear();

    await h.tick("2026-11-14 21:29");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([]);
    await h.tick("2026-11-14 21:30");
    const [again] = h.telegram.callsTo("sendMessage");
    expect(again?.text).toBe(az.defaultReminder);
    expect(buttonData(again?.reply_markup)[0]).toBe("done:2026-11-14");
    expect(h.day(AYSEL, "2026-11-14")?.snooze_until).toBeNull();
  });

  it("fires only once", async () => {
    h.at("2026-11-14 21:00");
    await h.tap(AYSEL, "snooze:30:2026-11-14");
    h.telegram.clear();
    await h.tickEveryMinute("2026-11-14 21:29", "2026-11-14 21:45");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.defaultReminder]);
  });

  it("can be snoozed again", async () => {
    h.at("2026-11-14 21:00");
    await h.tap(AYSEL, "snooze:30:2026-11-14");
    await h.tick("2026-11-14 21:30");
    h.at("2026-11-14 21:30");
    await h.tap(AYSEL, "snooze:60:2026-11-14");
    h.telegram.clear();
    await h.tickEveryMinute("2026-11-14 21:31", "2026-11-14 22:30");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.defaultReminder]);
  });

  it("fires after midnight for the same day", async () => {
    h.at("2026-11-14 23:50");
    await h.tap(AYSEL, "snooze:60:2026-11-14");
    h.telegram.clear();
    await h.tick("2026-11-15 00:50");
    const [again] = h.telegram.callsTo("sendMessage");
    expect(buttonData(again?.reply_markup)[0]).toBe("done:2026-11-14");
  });

  it("uses the custom reminder text", async () => {
    await h.tap(AYSEL, "s:msg");
    await h.send(AYSEL, "Custom!");
    h.at("2026-11-14 21:00");
    await h.tap(AYSEL, "snooze:30:2026-11-14");
    h.telegram.clear();
    await h.tick("2026-11-14 21:30");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual(["Custom!"]);
  });

  it("doesn't fire if the mentee pauses in the meantime", async () => {
    h.at("2026-11-14 21:00");
    await h.tap(AYSEL, "snooze:30:2026-11-14");
    await h.send(AYSEL, "/pause");
    h.telegram.clear();
    await h.tick("2026-11-14 21:30");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([]);
  });
});

describe("23:50 nudge", () => {
  it("is sent when the day isn't done", async () => {
    await h.tick("2026-11-14 21:00");
    h.telegram.clear();
    await h.tick("2026-11-14 23:50");
    const [nudge] = h.telegram.callsTo("sendMessage");
    expect(nudge?.text).toBe(az.nudge);
    expect(buttonData(nudge?.reply_markup)[0]).toBe("done:2026-11-14");
    expect(h.day(AYSEL, "2026-11-14")?.nudged_at).toBe(seconds("2026-11-14 23:50"));
  });

  it("is not sent when the day is done", async () => {
    await h.tick("2026-11-14 21:00");
    await h.tap(AYSEL, "done:2026-11-14");
    h.telegram.clear();
    await h.tickEveryMinute("2026-11-14 23:45", "2026-11-15 00:10");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([]);
  });

  it("is sent once, then nothing more until the next day", async () => {
    await h.tickEveryMinute("2026-11-14 23:49", "2026-11-15 04:30");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.nudge]);
  });

  it("is sent even if the evening reminder was missed entirely", async () => {
    await h.tick("2026-11-14 23:52");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.nudge]);
  });

  it("is skipped within an hour of a late reminder", async () => {
    await h.tap(AYSEL, "s:t:1395");
    h.telegram.clear();
    await h.tickEveryMinute("2026-11-14 23:14", "2026-11-14 23:59");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.defaultReminder]);
  });

  it("is skipped while a snooze is pending past midnight", async () => {
    h.at("2026-11-14 23:40");
    await h.tap(AYSEL, "snooze:30:2026-11-14");
    h.telegram.clear();
    await h.tickEveryMinute("2026-11-14 23:45", "2026-11-15 00:10");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.defaultReminder]);
  });

  it("is not sent on a day off", async () => {
    await h.tap(AYSEL, "s:d:5");
    await h.tick("2026-11-14 23:50");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([]);
  });

  it("follows the bot language", async () => {
    await h.tap(ADMIN, "a:lang:en");
    h.telegram.clear();
    await h.tick("2026-11-14 23:50");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([en.nudge]);
  });
});

describe("a full day, minute by minute", () => {
  it("sends one reminder and one nudge when nothing is done", async () => {
    await h.tickEveryMinute("2026-11-14 04:00", "2026-11-15 03:59");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.defaultReminder, az.nudge]);
  });

  it("sends only the reminder when Done is tapped in the evening", async () => {
    await h.tickEveryMinute("2026-11-14 20:00", "2026-11-14 22:00");
    await h.tap(AYSEL, "done:2026-11-14");
    await h.tickEveryMinute("2026-11-14 22:01", "2026-11-15 03:59");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.defaultReminder]);
  });

  it("handles reminder, snooze, nudge and a Done after midnight", async () => {
    await h.tickEveryMinute("2026-11-14 20:55", "2026-11-14 21:05");
    await h.tap(AYSEL, "snooze:60:2026-11-14");
    await h.tickEveryMinute("2026-11-14 21:06", "2026-11-15 00:30");
    await h.tap(AYSEL, "done:2026-11-14");
    await h.tickEveryMinute("2026-11-15 00:31", "2026-11-15 03:59");

    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.defaultReminder, az.defaultReminder, az.nudge]);
    expect(h.day(AYSEL, "2026-11-14")?.done_at).toBe(seconds("2026-11-15 00:30"));
  });
});

describe("delivery failures", () => {
  it("don't stop the others, and the blocked user isn't retried every minute", async () => {
    await h.onboard(MURAD);
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.telegram.failWhen("sendMessage", (payload) =>
      payload.chat_id === AYSEL.id
        ? { error_code: 403, description: "Forbidden: bot was blocked by the user" }
        : undefined,
    );
    await h.tickEveryMinute("2026-11-14 21:00", "2026-11-14 21:05");

    expect(h.telegram.recipients(ADMIN.id)).toEqual([AYSEL.id, MURAD.id]);
    expect(h.day(MURAD, "2026-11-14")?.reminded_at).not.toBeNull();
  });
});

/** Aysel writes on Saturday 2026-11-14; Murad has Saturdays off. */
async function yesterday(): Promise<void> {
  h.at("2026-11-14 22:00");
  await h.send(AYSEL, "/done");
  // Murad turned Saturdays off.
  await h.tap(MURAD, "s:d:5");
  h.telegram.clear();
}

describe("mentor summary", () => {
  beforeEach(async () => {
    await h.onboard(MURAD, NIGAR);
    await h.onboardMentor();
  });

  it("is not sent while off (the default)", async () => {
    await yesterday();
    await h.tickEveryMinute("2026-11-15 09:59", "2026-11-15 10:05");
    expect(h.telegram.sentTo(MENTOR.id)).toEqual([]);
  });

  it("sends counts only at 10:00", async () => {
    await h.tap(ADMIN, "a:digest:count");
    await yesterday();
    await h.tick("2026-11-15 09:59");
    expect(h.telegram.sentTo(MENTOR.id)).toEqual([]);
    await h.tick("2026-11-15 10:00");
    expect(h.telegram.sentTo(MENTOR.id)).toEqual([
      `${az.digestTitle("14.11.2026")}\n\n${az.digestCount(1, 3)}\n${az.digestOffCount(1)}`,
    ]);
  });

  it("sends names with each status", async () => {
    await h.tap(ADMIN, "a:digest:names");
    await yesterday();
    await h.tick("2026-11-15 10:00");
    expect(h.telegram.sentTo(MENTOR.id)).toEqual([
      [
        az.digestTitle("14.11.2026"),
        "",
        `${az.digestDone}: Aysel`,
        `${az.digestMissed}: Nigar, Yusif`,
        `${az.digestOff}: Murad`,
      ].join("\n"),
    ]);
  });

  it("is sent once a day even though the cron runs every minute", async () => {
    await h.tap(ADMIN, "a:digest:count");
    await yesterday();
    await h.tickEveryMinute("2026-11-15 10:00", "2026-11-15 10:30");
    await h.tick("2026-11-15 23:00");
    expect(h.telegram.sentTo(MENTOR.id)).toHaveLength(1);
    expect(h.setting("digest_sent_day")).toBe("2026-11-14");
  });

  it("is sent again the next morning about the next day", async () => {
    await h.tap(ADMIN, "a:digest:count");
    await h.tick("2026-11-15 10:00");
    await h.tick("2026-11-16 10:00");
    const [first, second] = h.telegram.sentTo(MENTOR.id);
    expect(first).toContain("14.11.2026");
    expect(second).toContain("15.11.2026");
  });

  it("is sent late if 10:00 was missed", async () => {
    await h.tap(ADMIN, "a:digest:count");
    await h.tick("2026-11-15 14:00");
    expect(h.telegram.sentTo(MENTOR.id)).toHaveLength(1);
  });

  it("counts notes written after midnight for the previous day", async () => {
    await h.tap(ADMIN, "a:digest:names");
    h.at("2026-11-15 02:30");
    await h.send(MURAD, "/done");
    await h.tick("2026-11-15 10:00");
    expect(h.telegram.sentTo(MENTOR.id)[0]).toContain(`${az.digestDone}: Murad`);
  });

  it("does not count notes written after 04:00 for the previous day", async () => {
    await h.tap(ADMIN, "a:digest:names");
    h.at("2026-11-15 08:00");
    await h.send(MURAD, "/done");
    await h.tick("2026-11-15 10:00");
    expect(h.telegram.sentTo(MENTOR.id)[0]).toContain(`${az.digestMissed}: Aysel, Murad, Nigar, Yusif`);
  });

  it("shows paused mentees as a day off", async () => {
    await h.tap(ADMIN, "a:digest:names");
    await h.send(NIGAR, "/pause");
    await h.tick("2026-11-15 10:00");
    expect(h.telegram.sentTo(MENTOR.id)[0]).toContain(`${az.digestOff}: Nigar`);
  });

  it("waits until a mentor has pressed Start", async () => {
    await h.send(ADMIN, "/remove @leyla_mentor");
    await h.send(ADMIN, "/mentor @leyla_mentor");
    await h.tap(ADMIN, "a:digest:count");
    await h.tick("2026-11-15 10:00");
    expect(h.setting("digest_sent_day")).toBeUndefined();

    await h.send(MENTOR, "/start");
    h.telegram.clear();
    await h.tick("2026-11-15 10:01");
    expect(h.telegram.sentTo(MENTOR.id)).toHaveLength(1);
  });

  it("follows the bot language", async () => {
    await h.tap(ADMIN, "a:lang:en");
    await h.tap(ADMIN, "a:digest:count");
    await h.tick("2026-11-15 10:00");
    expect(h.telegram.sentTo(MENTOR.id)[0]).toContain(en.digestTitle("14.11.2026"));
  });

  it("is sent to every mentor", async () => {
    const second = { id: 51, first_name: "Kamran", username: "kamran_mentor" };
    await h.onboardMentor(second);
    await h.tap(ADMIN, "a:digest:count");
    await h.tick("2026-11-15 10:00");
    expect(h.telegram.sentTo(MENTOR.id)).toHaveLength(1);
    expect(h.telegram.sentTo(second.id)).toHaveLength(1);
  });

  it("is never shown to mentees", async () => {
    await h.tap(ADMIN, "a:digest:names");
    h.telegram.clear();
    await h.tick("2026-11-15 10:00");
    const recipients = h.telegram.recipients();
    expect(recipients).toEqual([MENTOR.id]);
  });
});
