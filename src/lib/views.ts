import { InlineKeyboard } from "grammy";
import type { MessageEntity } from "grammy/types";
import type { Member, Settings } from "./db";
import { DIGEST_MODES } from "./digest";
import { LANGS, LANG_NAMES, type Messages } from "./i18n";
import { ALL_DAYS, formatMinutes, isActiveDay } from "./time";

export const SNOOZE_MINUTES = [30, 60];
export const PICKER_HOURS = Array.from({ length: 18 }, (_, i) => i + 6);
export const PICKER_MINUTES = [0, 15, 30, 45];
export const MAX_MESSAGE_LENGTH = 500;

const check = (on: boolean) => (on ? "✅" : "▫️");

export function reminderKeyboard(t: Messages, day: string): InlineKeyboard {
  const keyboard = new InlineKeyboard().text(t.btnDone, `done:${day}`).row();
  for (const minutes of SNOOZE_MINUTES) keyboard.text(t.btnSnooze(minutes), `snooze:${minutes}:${day}`);
  return keyboard;
}

export interface SettingsView {
  text: string;
  entities: MessageEntity[];
}

/** The reminder text goes last, in an expandable quote, so a long one collapses instead of burying the rest. */
export function settingsView(t: Messages, member: Member): SettingsView {
  const days =
    member.weekdays === ALL_DAYS
      ? t.everyDay
      : member.weekdays === 0
        ? t.noDays
        : t.weekdays.filter((_, i) => isActiveDay(member.weekdays, i)).join(", ");
  const head = [
    t.settingsTitle,
    "",
    `${t.settingTime}: ${formatMinutes(member.remind_at)}`,
    `${t.settingDays}: ${days}`,
    `${t.settingStatus}: ${member.paused ? t.pausedStatus : t.active}`,
    `${t.settingMessage}:`,
    "",
  ].join("\n");
  const message = member.message ?? t.defaultReminder;
  // Entity offsets are in UTF-16 code units, which is what String#length counts.
  return {
    text: head + message,
    entities: [{ type: "expandable_blockquote", offset: head.length, length: message.length }],
  };
}

/** Arguments for ctx.reply / ctx.editMessageText that show the settings with their keyboard. */
export function settingsMessage(
  t: Messages,
  member: Member,
): [string, { entities: MessageEntity[]; reply_markup: InlineKeyboard }] {
  const { text, entities } = settingsView(t, member);
  return [text, { entities, reply_markup: settingsKeyboard(t, member) }];
}

export function settingsKeyboard(t: Messages, member: Member): InlineKeyboard {
  return new InlineKeyboard()
    .text(t.btnTime, "s:time")
    .text(t.btnDays, "s:days")
    .row()
    .text(t.btnMessage, "s:msg")
    .text(member.paused ? t.btnResume : t.btnPause, member.paused ? "s:resume" : "s:pause");
}

export function hoursKeyboard(t: Messages): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  PICKER_HOURS.forEach((hour, i) => {
    keyboard.text(String(hour).padStart(2, "0"), `s:h:${hour}`);
    if (i % 6 === 5) keyboard.row();
  });
  return keyboard.text(t.btnBack, "s:back");
}

export function minutesKeyboard(t: Messages, hour: number): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const minute of PICKER_MINUTES) {
    keyboard.text(formatMinutes(hour * 60 + minute), `s:t:${hour * 60 + minute}`);
  }
  return keyboard.row().text(t.btnBack, "s:time");
}

export function daysKeyboard(t: Messages, mask: number): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  t.weekdays.forEach((label, i) => {
    keyboard.text(`${check(isActiveDay(mask, i))} ${label}`, `s:d:${i}`);
    if (i === 3) keyboard.row();
  });
  return keyboard.row().text(t.btnBack, "s:back");
}

export function messageKeyboard(t: Messages): InlineKeyboard {
  return new InlineKeyboard().text(t.btnResetMessage, "s:msgreset").text(t.btnBack, "s:back");
}

export function isPickerTime(minutes: number): boolean {
  return PICKER_HOURS.includes(Math.floor(minutes / 60)) && PICKER_MINUTES.includes(minutes % 60);
}

export function displayName(member: Member): string {
  if (member.username.startsWith("id:")) return member.name ?? member.username;
  return member.name ? `${member.name} (@${member.username})` : `@${member.username}`;
}

export function adminText(t: Messages, members: Member[]): string {
  const mentors = members.filter((member) => member.role === "mentor").map(displayName);
  const mentees = members.filter((member) => member.role === "mentee");
  return [
    t.adminTitle,
    "",
    `${t.adminMentor}: ${mentors.length > 0 ? mentors.join(", ") : t.notSet}`,
    `${t.adminMentees}: ${mentees.length}`,
    "",
    t.adminHelp,
  ].join("\n");
}

export function adminKeyboard(t: Messages, settings: Settings): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const lang of LANGS) {
    keyboard.text(`${settings.lang === lang ? "● " : ""}${LANG_NAMES[lang]}`, `a:lang:${lang}`);
  }
  keyboard.row();
  for (const mode of DIGEST_MODES) {
    keyboard.text(`${settings.digestMode === mode ? "● " : ""}${t.digestModes[mode]}`, `a:digest:${mode}`);
  }
  return keyboard;
}

export function adminSettingsText(t: Messages, settings: Settings, members: Member[]): string {
  return [
    adminText(t, members),
    "",
    `${t.adminLanguage}: ${LANG_NAMES[settings.lang]}`,
    `${t.adminDigest}: ${t.digestModes[settings.digestMode]}`,
  ].join("\n");
}

export function membersText(t: Messages, members: Member[]): string {
  if (members.length === 0) return t.noMembers;
  const lines = members.map((member) => {
    const tags = [
      member.role === "mentor" ? t.mentorTag : null,
      member.tg_id === null ? t.notStarted : null,
      member.paused ? t.pausedStatus : null,
    ].filter(Boolean);
    return `• ${displayName(member)}${tags.length > 0 ? ` (${tags.join(", ")})` : ""}`;
  });
  return [t.membersTitle, "", ...lines].join("\n");
}
