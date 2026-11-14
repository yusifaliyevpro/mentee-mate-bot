import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "../src/lib/i18n";
import { seconds } from "./helpers";
import { buttonData, buttonLabels } from "./support/fake-telegram";
import { ADMIN, AYSEL, Harness, MENTOR, MURAD, STRANGER } from "./support/harness";

const az = messages.az;
const en = messages.en;

let h: Harness;

beforeEach(async () => {
  h = await Harness.create("2026-11-14 12:00");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("access control", () => {
  it("turns away users who aren't on the allowlist", async () => {
    await h.send(STRANGER, "/start");
    expect(h.telegram.sentTo(STRANGER.id)).toEqual([az.notAllowed]);
    expect(h.member(STRANGER)).toBeUndefined();
  });

  it("turns away users without a username", async () => {
    await h.send({ id: 77, first_name: "NoName" }, "/start");
    expect(h.telegram.sentTo(77)).toEqual([az.notAllowed]);
  });

  it("answers a stranger's button tap with the not-allowed notice", async () => {
    await h.tap(STRANGER, "s:time");
    expect(h.telegram.answers()).toEqual([az.notAllowed]);
  });

  it("lets an allowlisted user in and links their Telegram account", async () => {
    await h.send(ADMIN, "/allow @aysel_m");
    await h.send(AYSEL, "/start");
    const [welcome, settings] = h.telegram.sentTo(AYSEL.id);
    expect(welcome).toBe(az.welcome("Aysel"));
    expect(settings).toContain(az.settingsTitle);
    expect(h.member(AYSEL)).toMatchObject({ username: "aysel_m", tg_id: AYSEL.id, name: "Aysel", role: "mentee" });
  });

  it("matches usernames case-insensitively", async () => {
    await h.send(ADMIN, "/allow @AYSEL_M");
    await h.send({ ...AYSEL, username: "Aysel_M" }, "/start");
    expect(h.member(AYSEL)?.username).toBe("aysel_m");
  });

  it("keeps access after the user changes their username", async () => {
    await h.onboard(AYSEL);
    await h.send({ ...AYSEL, username: "aysel_new" }, "/settings");
    expect(h.telegram.sentTo(AYSEL.id)[0]).toContain(az.settingsTitle);
  });

  it("doesn't let a second account claim an already linked username", async () => {
    await h.onboard(AYSEL);
    const impostor = { id: 4242, first_name: "Fake", username: AYSEL.username };
    await h.send(impostor, "/start");
    expect(h.telegram.sentTo(impostor.id)).toEqual([az.notAllowed]);
    expect(h.member(AYSEL)?.tg_id).toBe(AYSEL.id);
  });

  it("registers the admin automatically, even without a username", async () => {
    const admin = { id: ADMIN.id, first_name: "Yusif" };
    await h.send(admin, "/start");
    expect(h.memberByUsername(`id:${ADMIN.id}`)).toMatchObject({ tg_id: ADMIN.id, role: "mentee" });
  });

  it("ignores group chats", async () => {
    await h.onboard(AYSEL);
    await h.send(AYSEL, "/start", "group");
    expect(h.telegram.calls).toEqual([]);
  });

  it("revokes access when a member is removed, and allows re-adding them", async () => {
    await h.onboard(AYSEL);
    await h.send(ADMIN, "/remove @aysel_m");
    await h.send(AYSEL, "/settings");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.notAllowed]);

    await h.send(ADMIN, "/allow @aysel_m");
    await h.send(AYSEL, "/start");
    expect(h.member(AYSEL)?.tg_id).toBe(AYSEL.id);
  });

  it("deletes a removed member's history", async () => {
    await h.onboard(AYSEL);
    await h.send(AYSEL, "/done");
    await h.send(ADMIN, "/remove @aysel_m");
    expect(h.db.query("SELECT * FROM days WHERE tg_id = ?", AYSEL.id)).toEqual([]);
  });
});

describe("/start", () => {
  it("shows the default settings to a new mentee", async () => {
    await h.onboard(AYSEL);
    await h.send(AYSEL, "/start");
    const [, settings] = h.telegram.callsTo("sendMessage");
    expect(settings?.text).toBe(
      `${az.settingsTitle}\n\n${az.settingTime}: 21:00\n${az.settingDays}: ${az.everyDay}\n${az.settingMessage}: ${az.defaultMessage}\n${az.settingStatus}: ${az.active}`,
    );
    expect(buttonData(settings?.reply_markup)).toEqual(["s:time", "s:days", "s:msg", "s:pause"]);
  });

  it("greets the mentor without settings", async () => {
    await h.send(ADMIN, "/mentor @leyla_mentor");
    await h.send(MENTOR, "/start");
    expect(h.telegram.sentTo(MENTOR.id)).toEqual([az.mentorWelcome("Leyla")]);
  });

  it("sets the command menus when the admin starts the bot", async () => {
    await h.send(ADMIN, "/start");
    const scopes = h.telegram.callsTo("setMyCommands").map((payload) => payload.scope);
    expect(scopes).toEqual([undefined, { type: "chat", chat_id: ADMIN.id }]);
  });

  it("doesn't touch command menus for other users", async () => {
    await h.onboard(AYSEL);
    await h.send(AYSEL, "/start");
    expect(h.telegram.callsTo("setMyCommands")).toEqual([]);
  });

  it("doesn't send a late reminder to someone who registers after their reminder time", async () => {
    h.at("2026-11-14 21:05");
    await h.onboard(AYSEL);
    await h.tick("2026-11-14 21:06");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([]);
  });

  it("still sends today's reminder to someone who registers before it", async () => {
    h.at("2026-11-14 20:00");
    await h.onboard(AYSEL);
    await h.tick("2026-11-14 21:00");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.defaultReminder]);
  });
});

describe("/help", () => {
  it("shows mentee help", async () => {
    await h.onboard(AYSEL);
    await h.send(AYSEL, "/help");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.help]);
  });

  it("adds admin commands for the admin", async () => {
    await h.send(ADMIN, "/help");
    expect(h.telegram.sentTo(ADMIN.id)).toEqual([`${az.help}\n\n${az.adminHelp}`]);
  });
});

describe("admin commands", () => {
  it("allows several usernames at once, with or without @ and commas", async () => {
    await h.send(ADMIN, "/allow @Aysel_M, murad_k   @nigar_a");
    expect(
      h.db.query<{ username: string }>("SELECT username FROM members WHERE role = 'mentee' ORDER BY username"),
    ).toEqual([
      { username: "aysel_m" },
      { username: "murad_k" },
      { username: "nigar_a" },
      { username: "yusifaliyevpro" },
    ]);
    expect(h.telegram.sentTo(ADMIN.id)).toEqual([az.allowed(["@aysel_m", "@murad_k", "@nigar_a"])]);
  });

  it("rejects /allow without usernames", async () => {
    await h.send(ADMIN, "/allow");
    expect(h.telegram.sentTo(ADMIN.id)).toEqual([az.usageAllow]);
  });

  it("rejects /allow if any username is invalid, adding nobody", async () => {
    await h.send(ADMIN, "/allow @aysel_m @bad-name");
    expect(h.telegram.sentTo(ADMIN.id)).toEqual([az.usageAllow]);
    expect(h.memberByUsername("aysel_m")).toBeUndefined();
  });

  it("allowing someone twice keeps their settings", async () => {
    await h.onboard(AYSEL);
    await h.tap(AYSEL, "s:t:1320");
    await h.send(ADMIN, "/allow @aysel_m");
    expect(h.member(AYSEL)).toMatchObject({ remind_at: 1320, tg_id: AYSEL.id });
  });

  it("sets the mentor", async () => {
    await h.send(ADMIN, "/mentor @Leyla_Mentor");
    expect(h.memberByUsername("leyla_mentor")?.role).toBe("mentor");
    expect(h.telegram.sentTo(ADMIN.id)).toEqual([az.mentorSet("@leyla_mentor")]);
  });

  it("turns an existing mentee into the mentor", async () => {
    await h.onboard(AYSEL);
    await h.send(ADMIN, "/mentor @aysel_m");
    expect(h.member(AYSEL)?.role).toBe("mentor");
  });

  it("rejects /mentor without a valid username", async () => {
    await h.send(ADMIN, "/mentor");
    await h.send(ADMIN, "/mentor @x");
    expect(h.telegram.sentTo(ADMIN.id)).toEqual([az.usageMentor, az.usageMentor]);
  });

  it("removes someone, or says they aren't on the list", async () => {
    await h.send(ADMIN, "/allow @aysel_m");
    await h.send(ADMIN, "/remove @aysel_m");
    await h.send(ADMIN, "/remove @aysel_m");
    await h.send(ADMIN, "/remove");
    expect(h.telegram.sentTo(ADMIN.id).slice(1)).toEqual([
      az.removed("@aysel_m"),
      az.notFound("@aysel_m"),
      az.usageRemove,
    ]);
  });

  it("lists members with their status", async () => {
    await h.onboard(AYSEL);
    await h.send(ADMIN, "/allow @murad_k");
    await h.send(ADMIN, "/mentor @leyla_mentor");
    await h.send(AYSEL, "/pause");
    h.telegram.clear();
    await h.send(ADMIN, "/members");
    expect(h.telegram.sentTo(ADMIN.id)[0]).toBe(
      [
        az.membersTitle,
        "",
        `• @leyla_mentor (${az.mentorTag}, ${az.notStarted})`,
        `• Aysel (@aysel_m) (${az.pausedStatus})`,
        `• @murad_k (${az.notStarted})`,
        "• Yusif (@yusifaliyevpro)",
      ].join("\n"),
    );
  });

  it("are ignored for everyone except the admin", async () => {
    await h.onboard(AYSEL);
    await h.send(AYSEL, "/allow @murad_k");
    await h.send(AYSEL, "/mentor @murad_k");
    await h.send(AYSEL, "/remove @aysel_m");
    await h.send(AYSEL, "/admin");
    expect(h.memberByUsername("murad_k")).toBeUndefined();
    expect(h.member(AYSEL)).toBeDefined();
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.unknown, az.unknown, az.unknown, az.unknown]);
  });

  it("ignores admin buttons tapped by someone else", async () => {
    await h.onboard(AYSEL);
    await h.tap(AYSEL, "a:lang:en");
    await h.tap(AYSEL, "a:digest:names");
    expect(h.setting("lang")).toBeUndefined();
    expect(h.setting("digest_mode")).toBeUndefined();
  });
});

describe("admin panel", () => {
  it("shows language and summary mode with the current choice marked", async () => {
    await h.send(ADMIN, "/admin");
    const [panel] = h.telegram.callsTo("sendMessage");
    expect(panel?.text).toContain(`${az.adminLanguage}: 🇦🇿 Azərbaycanca`);
    expect(panel?.text).toContain(`${az.adminDigest}: ${az.digestModes.off}`);
    expect(buttonLabels(panel?.reply_markup)).toEqual([
      "● 🇦🇿 Azərbaycanca",
      "🇬🇧 English",
      `● ${az.digestModes.off}`,
      az.digestModes.count,
      az.digestModes.names,
    ]);
  });

  it("switches the whole bot to English", async () => {
    await h.onboard(AYSEL);
    await h.tap(ADMIN, "a:lang:en");
    expect(h.setting("lang")).toBe("en");
    expect(h.lastEditText()).toContain(`${en.adminLanguage}: 🇬🇧 English`);
    const menus = h.telegram.callsTo("setMyCommands");
    expect(menus[0]?.commands).toContainEqual({ command: "settings", description: en.commands.settings });

    await h.send(AYSEL, "/help");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([en.help]);
  });

  it("changes the mentor summary mode", async () => {
    await h.tap(ADMIN, "a:digest:names");
    expect(h.setting("digest_mode")).toBe("names");
    expect(h.lastEditText()).toContain(`${az.adminDigest}: ${az.digestModes.names}`);
  });

  it("ignores unknown languages and modes", async () => {
    await h.tap(ADMIN, "a:lang:ru");
    await h.tap(ADMIN, "a:digest:everything");
    expect(h.setting("lang")).toBeUndefined();
    expect(h.setting("digest_mode")).toBeUndefined();
    expect(h.telegram.answers()).toEqual([undefined, undefined]);
  });

  it("doesn't fail when the same option is tapped again", async () => {
    h.telegram.failWhen("editMessageText", () => ({
      error_code: 400,
      description: "Bad Request: message is not modified",
    }));
    await expect(h.tap(ADMIN, "a:lang:az")).resolves.toBeUndefined();
    expect(h.telegram.answers()).toHaveLength(1);
  });
});

describe("settings: reminder time", () => {
  beforeEach(async () => {
    await h.onboard(AYSEL);
  });

  it("walks through hour and minute pickers", async () => {
    await h.tap(AYSEL, "s:time");
    expect(h.lastEditText()).toBe(az.pickHour);
    expect(buttonData(h.telegram.lastEdit()?.reply_markup)).toContain("s:h:22");

    await h.tap(AYSEL, "s:h:22");
    expect(h.lastEditText()).toBe(az.pickMinute("22"));
    expect(buttonData(h.telegram.lastEdit()?.reply_markup)).toEqual([
      "s:t:1320",
      "s:t:1335",
      "s:t:1350",
      "s:t:1365",
      "s:time",
    ]);

    await h.tap(AYSEL, "s:t:1350");
    expect(h.member(AYSEL)?.remind_at).toBe(22 * 60 + 30);
    expect(h.lastEditText()).toContain(`${az.settingTime}: 22:30`);
  });

  it("pads single-digit hours", async () => {
    await h.tap(AYSEL, "s:h:7");
    expect(h.lastEditText()).toBe(az.pickMinute("07"));
  });

  it("ignores hours and times outside the picker", async () => {
    await h.tap(AYSEL, "s:h:3");
    await h.tap(AYSEL, "s:t:1351");
    await h.tap(AYSEL, "s:t:120");
    expect(h.member(AYSEL)?.remind_at).toBe(21 * 60);
    expect(h.telegram.lastEdit()).toBeUndefined();
    expect(h.telegram.answers()).toHaveLength(3);
  });

  it("a time later today still fires today", async () => {
    h.at("2026-11-14 21:30");
    await h.tap(AYSEL, "s:t:1320");
    await h.tick("2026-11-14 22:00");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.defaultReminder]);
  });

  it("a time that already passed today starts tomorrow", async () => {
    h.at("2026-11-14 21:30");
    await h.tap(AYSEL, "s:t:1260");
    expect(h.day(AYSEL, "2026-11-14")?.reminded_at).not.toBeNull();
    await h.tick("2026-11-14 21:31");
    await h.tick("2026-11-15 21:00");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.defaultReminder]);
  });

  it("choosing the current minute still fires now", async () => {
    h.at("2026-11-14 21:15");
    await h.tap(AYSEL, "s:t:1275");
    await h.tick("2026-11-14 21:15");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.defaultReminder]);
  });

  it("goes back from the hour picker to the settings", async () => {
    await h.tap(AYSEL, "s:time");
    await h.tap(AYSEL, "s:back");
    expect(h.lastEditText()).toContain(az.settingsTitle);
  });
});

describe("settings: days", () => {
  beforeEach(async () => {
    await h.onboard(AYSEL);
  });

  it("shows all days on by default", async () => {
    await h.tap(AYSEL, "s:days");
    expect(h.lastEditText()).toBe(az.pickDays);
    expect(buttonLabels(h.telegram.lastEdit()?.reply_markup).slice(0, 7)).toEqual(
      az.weekdays.map((day) => `✅ ${day}`),
    );
  });

  it("toggles a day off and on again", async () => {
    await h.tap(AYSEL, "s:d:5");
    expect(h.member(AYSEL)?.weekdays).toBe(0b101_1111);
    expect(buttonLabels(h.telegram.lastEdit()?.reply_markup)[5]).toBe(`▫️ ${az.weekdays[5]}`);
    await h.tap(AYSEL, "s:d:5");
    expect(h.member(AYSEL)?.weekdays).toBe(0b111_1111);
  });

  it("lists the remaining days in the settings view", async () => {
    await h.tap(AYSEL, "s:d:5");
    await h.tap(AYSEL, "s:d:6");
    await h.tap(AYSEL, "s:back");
    expect(h.lastEditText()).toContain(`${az.settingDays}: ${az.weekdays.slice(0, 5).join(", ")}`);
  });

  it("shows 'none' when every day is off", async () => {
    for (let day = 0; day < 7; day++) await h.tap(AYSEL, `s:d:${day}`);
    await h.tap(AYSEL, "s:back");
    expect(h.lastEditText()).toContain(`${az.settingDays}: ${az.noDays}`);
  });

  it("ignores invalid weekdays", async () => {
    await h.tap(AYSEL, "s:d:7");
    expect(h.member(AYSEL)?.weekdays).toBe(0b111_1111);
  });

  it("doesn't remind on a day that was turned off", async () => {
    // 2026-11-14 is a Saturday.
    await h.tap(AYSEL, "s:d:5");
    await h.tickEveryMinute("2026-11-14 20:59", "2026-11-14 23:59");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([]);
  });
});

describe("settings: reminder text", () => {
  beforeEach(async () => {
    await h.onboard(AYSEL);
  });

  it("saves custom text and uses it for reminders", async () => {
    await h.tap(AYSEL, "s:msg");
    expect(h.lastEditText()).toBe(az.messagePrompt);
    expect(h.member(AYSEL)?.awaiting).toBe("message");

    await h.send(AYSEL, "  Yaz, Aysel! ✍️  ");
    expect(h.member(AYSEL)).toMatchObject({ message: "Yaz, Aysel! ✍️", awaiting: null });
    const [saved, settings] = h.telegram.sentTo(AYSEL.id);
    expect(saved).toBe(az.messageSaved);
    expect(settings).toContain(`${az.settingMessage}: Yaz, Aysel! ✍️`);

    await h.tick("2026-11-14 21:00");
    expect(h.telegram.sentTo(AYSEL.id).at(-1)).toBe("Yaz, Aysel! ✍️");
  });

  it("rejects text over 500 characters and keeps waiting", async () => {
    await h.tap(AYSEL, "s:msg");
    await h.send(AYSEL, "a".repeat(501));
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.messageTooLong]);
    expect(h.member(AYSEL)).toMatchObject({ message: null, awaiting: "message" });

    await h.send(AYSEL, "a".repeat(500));
    expect(h.member(AYSEL)?.message).toHaveLength(500);
  });

  it("doesn't save commands as the reminder text", async () => {
    await h.tap(AYSEL, "s:msg");
    await h.send(AYSEL, "/whatever");
    expect(h.member(AYSEL)).toMatchObject({ message: null, awaiting: "message" });
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.unknown]);
  });

  it("still handles real commands while waiting for text", async () => {
    await h.tap(AYSEL, "s:msg");
    await h.send(AYSEL, "/done");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.markedDone]);
  });

  it("cancels with /cancel", async () => {
    await h.tap(AYSEL, "s:msg");
    await h.send(AYSEL, "/cancel");
    await h.send(AYSEL, "Not a reminder");
    expect(h.member(AYSEL)).toMatchObject({ message: null, awaiting: null });
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.cancelled, az.unknown]);
  });

  it("cancels with the back button", async () => {
    await h.tap(AYSEL, "s:msg");
    await h.tap(AYSEL, "s:back");
    expect(h.member(AYSEL)?.awaiting).toBeNull();
    expect(h.lastEditText()).toContain(az.settingsTitle);
  });

  it("resets to the default text", async () => {
    await h.tap(AYSEL, "s:msg");
    await h.send(AYSEL, "Custom");
    await h.tap(AYSEL, "s:msgreset");
    expect(h.member(AYSEL)).toMatchObject({ message: null, awaiting: null });
    expect(h.telegram.answers().at(-1)).toBe(az.messageReset);
    expect(h.lastEditText()).toContain(`${az.settingMessage}: ${az.defaultMessage}`);
  });

  it("replies with a hint to random text", async () => {
    await h.send(AYSEL, "salam");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.unknown]);
  });
});

describe("pause and resume", () => {
  beforeEach(async () => {
    await h.onboard(AYSEL);
  });

  it("works with commands", async () => {
    await h.send(AYSEL, "/pause");
    expect(h.member(AYSEL)?.paused).toBe(1);
    await h.tick("2026-11-14 21:00");
    await h.send(AYSEL, "/resume");
    expect(h.member(AYSEL)?.paused).toBe(0);
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.paused, az.resumed]);
  });

  it("works with the settings button, which flips its label", async () => {
    await h.tap(AYSEL, "s:pause");
    expect(h.member(AYSEL)?.paused).toBe(1);
    expect(buttonData(h.telegram.lastEdit()?.reply_markup)).toContain("s:resume");
    expect(h.lastEditText()).toContain(az.pausedStatus);

    await h.tap(AYSEL, "s:resume");
    expect(h.member(AYSEL)?.paused).toBe(0);
    expect(buttonData(h.telegram.lastEdit()?.reply_markup)).toContain("s:pause");
  });
});

describe("marking the day as done", () => {
  beforeEach(async () => {
    await h.onboard(AYSEL);
  });

  it("/done marks today", async () => {
    h.at("2026-11-14 19:00");
    await h.send(AYSEL, "/done");
    expect(h.day(AYSEL, "2026-11-14")?.done_at).toBe(seconds("2026-11-14 19:00"));
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.markedDone]);
  });

  it("/done twice says it's already done", async () => {
    await h.send(AYSEL, "/done");
    await h.send(AYSEL, "/done");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([az.markedDone, az.alreadyDone]);
  });

  it("/done after midnight counts for the previous day", async () => {
    h.at("2026-11-15 01:30");
    await h.send(AYSEL, "/done");
    expect(h.day(AYSEL, "2026-11-14")?.done_at).not.toBeNull();
    expect(h.day(AYSEL, "2026-11-15")).toBeUndefined();
  });

  it("/done from 04:00 counts for the new day", async () => {
    h.at("2026-11-15 04:00");
    await h.send(AYSEL, "/done");
    expect(h.day(AYSEL, "2026-11-15")?.done_at).not.toBeNull();
  });

  it("/done before the reminder means no reminder is sent", async () => {
    h.at("2026-11-14 18:00");
    await h.send(AYSEL, "/done");
    h.telegram.clear();
    await h.tickEveryMinute("2026-11-14 20:59", "2026-11-14 23:59");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([]);
  });

  it("the Done button marks the day and replaces the reminder", async () => {
    h.at("2026-11-14 22:14");
    await h.tap(AYSEL, "done:2026-11-14", az.defaultReminder);
    expect(h.day(AYSEL, "2026-11-14")?.done_at).toBe(seconds("2026-11-14 22:14"));
    expect(h.lastEditText()).toBe(az.doneAt("22:14"));
    expect(h.telegram.lastEdit()?.reply_markup).toBeUndefined();
  });

  it("the Done button works after midnight for the previous day", async () => {
    h.at("2026-11-15 02:00");
    await h.tap(AYSEL, "done:2026-11-14");
    expect(h.day(AYSEL, "2026-11-14")?.done_at).toBe(seconds("2026-11-15 02:00"));
  });

  it("the Done button on an old reminder says the day is over", async () => {
    h.at("2026-11-15 04:00");
    await h.tap(AYSEL, "done:2026-11-14");
    expect(h.day(AYSEL, "2026-11-14")).toBeUndefined();
    expect(h.telegram.answers()).toEqual([az.dayOver]);
  });

  it("tapping Done twice says it's already done", async () => {
    await h.tap(AYSEL, "done:2026-11-14");
    await h.tap(AYSEL, "done:2026-11-14");
    expect(h.telegram.answers()).toEqual([undefined, az.alreadyDone]);
  });

  it("Done clears a pending snooze", async () => {
    h.at("2026-11-14 21:00");
    await h.tap(AYSEL, "snooze:30:2026-11-14");
    await h.tap(AYSEL, "done:2026-11-14");
    expect(h.day(AYSEL, "2026-11-14")?.snooze_until).toBeNull();
    h.telegram.clear();
    await h.tick("2026-11-14 21:30");
    expect(h.telegram.sentTo(AYSEL.id)).toEqual([]);
  });

  it("ignores malformed callback data", async () => {
    await h.tap(AYSEL, "done:yesterday");
    await h.tap(AYSEL, "snooze:30:");
    expect(h.db.query("SELECT * FROM days")).toEqual([]);
  });
});

describe("snooze", () => {
  beforeEach(async () => {
    await h.onboard(AYSEL);
  });

  it("sets the snooze and notes it on the reminder", async () => {
    h.at("2026-11-14 21:00");
    await h.tap(AYSEL, "snooze:30:2026-11-14", az.defaultReminder);
    expect(h.day(AYSEL, "2026-11-14")?.snooze_until).toBe(seconds("2026-11-14 21:30"));
    expect(h.lastEditText()).toBe(`${az.defaultReminder}\n\n${az.snoozedUntil("21:30")}`);
  });

  it("supports one hour", async () => {
    h.at("2026-11-14 23:50");
    await h.tap(AYSEL, "snooze:60:2026-11-14", az.nudge);
    expect(h.day(AYSEL, "2026-11-14")?.snooze_until).toBe(seconds("2026-11-15 00:50"));
    expect(h.lastEditText()).toContain(az.snoozedUntil("00:50"));
  });

  it("refuses after the day is done", async () => {
    await h.send(AYSEL, "/done");
    await h.tap(AYSEL, "snooze:30:2026-11-14");
    expect(h.telegram.answers()).toEqual([az.alreadyDone]);
    expect(h.day(AYSEL, "2026-11-14")?.snooze_until).toBeNull();
  });

  it("refuses on an old reminder", async () => {
    h.at("2026-11-15 12:00");
    await h.tap(AYSEL, "snooze:30:2026-11-14");
    expect(h.telegram.answers()).toEqual([az.dayOver]);
  });

  it("refuses when the snooze would end after the day is over", async () => {
    h.at("2026-11-15 03:45");
    await h.tap(AYSEL, "snooze:30:2026-11-14");
    expect(h.day(AYSEL, "2026-11-14")?.snooze_until ?? null).toBeNull();
    expect(h.telegram.answers()).toEqual([az.snoozeTooLate]);
  });

  it("only accepts the offered durations", async () => {
    await h.tap(AYSEL, "snooze:600:2026-11-14");
    await h.tap(AYSEL, "snooze:0:2026-11-14");
    expect(h.db.query("SELECT * FROM days")).toEqual([]);
  });
});

describe("mentor", () => {
  beforeEach(async () => {
    await h.onboardMentor();
  });

  it("gets a polite note instead of mentee features", async () => {
    await h.send(MENTOR, "/settings");
    await h.send(MENTOR, "/done");
    await h.send(MENTOR, "salam");
    expect(h.telegram.sentTo(MENTOR.id)).toEqual([az.mentorNoSettings, az.mentorNoSettings, az.mentorNoSettings]);
    expect(h.db.query("SELECT * FROM days")).toEqual([]);
  });

  it("can't use mentee buttons", async () => {
    await h.tap(MENTOR, "s:pause");
    await h.tap(MENTOR, "done:2026-11-14");
    expect(h.memberByUsername("leyla_mentor")?.paused).toBe(0);
    expect(h.db.query("SELECT * FROM days")).toEqual([]);
    expect(h.telegram.answers()).toEqual([undefined, undefined]);
  });

  it("never gets reminders", async () => {
    await h.tickEveryMinute("2026-11-14 20:59", "2026-11-14 23:59");
    expect(h.telegram.sentTo(MENTOR.id)).toEqual([]);
  });
});

describe("errors", () => {
  it("don't escape the handler, so Telegram doesn't retry the update forever", async () => {
    await h.onboard(AYSEL);
    h.telegram.failWhen("sendMessage", () => ({
      error_code: 403,
      description: "Forbidden: bot was blocked by the user",
    }));
    await expect(h.send(AYSEL, "/help")).resolves.toBeUndefined();
  });

  it("are logged", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await h.onboard(AYSEL);
    h.telegram.failWhen("sendMessage", () => ({ error_code: 500, description: "Internal" }));
    await h.send(AYSEL, "/help");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("other users are unaffected by one user's failure", async () => {
    await h.onboard(AYSEL, MURAD);
    h.telegram.failWhen("sendMessage", (payload) =>
      payload.chat_id === AYSEL.id ? { error_code: 403, description: "Forbidden" } : undefined,
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    await h.send(AYSEL, "/help");
    await h.send(MURAD, "/help");
    expect(h.telegram.sentTo(MURAD.id)).toEqual([az.help]);
  });
});
