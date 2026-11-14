import { Bot, type Context } from "grammy";
import { syncCommands } from "./commands";
import type { Env } from "./env";
import * as db from "./lib/db";
import { isDigestMode } from "./lib/digest";
import { type Messages, isLang, messages } from "./lib/i18n";
import { reminderTimePassed } from "./lib/schedule";
import { formatMinutes, localTime, logicalDay, toggleDay, unixSeconds } from "./lib/time";
import {
  MAX_MESSAGE_LENGTH,
  PICKER_HOURS,
  adminKeyboard,
  adminSettingsText,
  daysKeyboard,
  hoursKeyboard,
  isPickerTime,
  membersText,
  messageKeyboard,
  minutesKeyboard,
  settingsKeyboard,
  settingsText,
} from "./lib/views";

export interface BotContext extends Context {
  userId: number;
  member: db.Member;
  settings: db.Settings;
  t: Messages;
  isAdmin: boolean;
}

const DAY_PATTERN = "(\\d{4}-\\d{2}-\\d{2})";
const now = () => new Date();

export function createBot(env: Env): Bot<BotContext> {
  const bot = new Bot<BotContext>(env.BOT_TOKEN);
  const adminId = Number(env.ADMIN_ID);
  const timeZone = env.TIMEZONE;
  const clock = (at: Date) => formatMinutes(localTime(at, timeZone).minutes);

  // Mark today as reminded so a time that already passed doesn't fire as a late catch-up.
  const skipPassedReminder = async (tgId: number, remindAt: number) => {
    const at = now();
    if (!reminderTimePassed(remindAt, at, timeZone)) return;
    const { day } = logicalDay(at, timeZone);
    const existing = await db.getDay(env.DB, tgId, day);
    if (!existing?.reminded_at) await db.setDay(env.DB, tgId, day, { reminded_at: unixSeconds(at) });
  };

  bot.use(async (ctx, next) => {
    if (!ctx.from || ctx.chat?.type !== "private") return;
    const settings = await db.getSettings(env.DB);
    const t = messages[settings.lang];
    const isAdmin = ctx.from.id === adminId;

    let member = await db.getMemberById(env.DB, ctx.from.id);
    if (!member) {
      const username = ctx.from.username?.toLowerCase();
      if (isAdmin) {
        member = await db.upsertAdmin(env.DB, username ?? `id:${ctx.from.id}`, ctx.from.id, ctx.from.first_name);
      } else if (username) {
        member = await db.claimMember(env.DB, username, ctx.from.id, ctx.from.first_name);
      }
      if (member) await skipPassedReminder(ctx.from.id, member.remind_at);
    }
    if (!member) {
      if (ctx.callbackQuery) await ctx.answerCallbackQuery(t.notAllowed);
      else await ctx.reply(t.notAllowed);
      return;
    }

    Object.assign(ctx, { userId: ctx.from.id, member, settings, t, isAdmin });
    await next();
  });

  bot.command("start", async (ctx) => {
    const name = ctx.from?.first_name ?? "";
    if (ctx.isAdmin) await syncCommands(ctx.api, ctx.settings.lang, adminId);
    if (ctx.member.role === "mentor") {
      await ctx.reply(ctx.t.mentorWelcome(name));
      return;
    }
    await ctx.reply(ctx.t.welcome(name));
    await ctx.reply(settingsText(ctx.t, ctx.member), { reply_markup: settingsKeyboard(ctx.t, ctx.member) });
  });

  bot.command("help", (ctx) => ctx.reply(ctx.isAdmin ? `${ctx.t.help}\n\n${ctx.t.adminHelp}` : ctx.t.help));

  // Admin
  const admin = bot.filter((ctx) => ctx.isAdmin);

  const showAdmin = async (ctx: BotContext, settings: db.Settings, edit: boolean) => {
    const t = messages[settings.lang];
    const text = adminSettingsText(t, settings, await db.listMembers(env.DB));
    const reply_markup = adminKeyboard(t, settings);
    if (edit) await ctx.editMessageText(text, { reply_markup });
    else await ctx.reply(text, { reply_markup });
  };

  admin.command("admin", (ctx) => showAdmin(ctx, ctx.settings, false));

  admin.callbackQuery(/^a:lang:(\w+)$/, async (ctx) => {
    const lang = ctx.match[1];
    if (!isLang(lang)) {
      await ctx.answerCallbackQuery();
      return;
    }
    await db.setSetting(env.DB, "lang", lang);
    await syncCommands(ctx.api, lang, adminId);
    await ctx.answerCallbackQuery();
    await showAdmin(ctx, { ...ctx.settings, lang }, true);
  });

  admin.callbackQuery(/^a:digest:(\w+)$/, async (ctx) => {
    const digestMode = ctx.match[1];
    if (!isDigestMode(digestMode)) {
      await ctx.answerCallbackQuery();
      return;
    }
    await db.setSetting(env.DB, "digest_mode", digestMode);
    await ctx.answerCallbackQuery();
    await showAdmin(ctx, { ...ctx.settings, digestMode }, true);
  });

  admin.command("allow", async (ctx) => {
    const usernames = ctx.match
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(db.normalizeUsername);
    if (usernames.length === 0 || usernames.includes(null)) {
      await ctx.reply(ctx.t.usageAllow);
      return;
    }
    const valid = usernames.filter((username): username is string => username !== null);
    await db.allowMembers(env.DB, valid, "mentee");
    await ctx.reply(ctx.t.allowed(valid.map((username) => `@${username}`)));
  });

  admin.command("mentor", async (ctx) => {
    const username = db.normalizeUsername(ctx.match);
    if (!username) {
      await ctx.reply(ctx.t.usageMentor);
      return;
    }
    await db.allowMembers(env.DB, [username], "mentor");
    await ctx.reply(ctx.t.mentorSet(`@${username}`));
  });

  admin.command("remove", async (ctx) => {
    const username = db.normalizeUsername(ctx.match);
    if (!username) {
      await ctx.reply(ctx.t.usageRemove);
      return;
    }
    const removed = await db.removeMember(env.DB, username);
    await ctx.reply(removed ? ctx.t.removed(`@${username}`) : ctx.t.notFound(`@${username}`));
  });

  admin.command("members", async (ctx) => ctx.reply(membersText(ctx.t, await db.listMembers(env.DB))));

  // Mentees
  const mentee = bot.filter((ctx) => ctx.member.role === "mentee");

  const showSettings = async (ctx: BotContext, member: db.Member) => {
    if (member.awaiting) member = await db.updateMember(env.DB, ctx.userId, { awaiting: null });
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(settingsText(ctx.t, member), { reply_markup: settingsKeyboard(ctx.t, member) });
  };

  const markDone = async (ctx: BotContext, day: string, at: Date): Promise<"done" | "already"> => {
    const existing = await db.getDay(env.DB, ctx.userId, day);
    if (existing?.done_at) return "already";
    await db.setDay(env.DB, ctx.userId, day, { done_at: unixSeconds(at), snooze_until: null });
    return "done";
  };

  mentee.command("settings", (ctx) =>
    ctx.reply(settingsText(ctx.t, ctx.member), { reply_markup: settingsKeyboard(ctx.t, ctx.member) }),
  );

  mentee.command("done", async (ctx) => {
    const at = now();
    const result = await markDone(ctx, logicalDay(at, timeZone).day, at);
    await ctx.reply(result === "done" ? ctx.t.markedDone : ctx.t.alreadyDone);
  });

  mentee.command("pause", async (ctx) => {
    await db.updateMember(env.DB, ctx.userId, { paused: 1 });
    await ctx.reply(ctx.t.paused);
  });

  mentee.command("resume", async (ctx) => {
    await db.updateMember(env.DB, ctx.userId, { paused: 0 });
    await ctx.reply(ctx.t.resumed);
  });

  mentee.command("cancel", async (ctx) => {
    if (ctx.member.awaiting) await db.updateMember(env.DB, ctx.userId, { awaiting: null });
    await ctx.reply(ctx.t.cancelled);
  });

  mentee.callbackQuery(new RegExp(`^done:${DAY_PATTERN}$`), async (ctx) => {
    const at = now();
    if (ctx.match[1] !== logicalDay(at, timeZone).day) {
      await ctx.answerCallbackQuery(ctx.t.dayOver);
      return;
    }
    if ((await markDone(ctx, ctx.match[1], at)) === "already") {
      await ctx.answerCallbackQuery(ctx.t.alreadyDone);
      return;
    }
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(ctx.t.doneAt(clock(at)));
  });

  mentee.callbackQuery(new RegExp(`^snooze:(\\d+):${DAY_PATTERN}$`), async (ctx) => {
    const at = now();
    const day = ctx.match[2] ?? "";
    if (day !== logicalDay(at, timeZone).day) {
      await ctx.answerCallbackQuery(ctx.t.dayOver);
      return;
    }
    const existing = await db.getDay(env.DB, ctx.userId, day);
    if (existing?.done_at) {
      await ctx.answerCallbackQuery(ctx.t.alreadyDone);
      return;
    }

    const until = new Date(at.getTime() + Number(ctx.match[1]) * 60_000);
    await db.setDay(env.DB, ctx.userId, day, { snooze_until: unixSeconds(until) });
    await ctx.answerCallbackQuery();
    const original = ctx.callbackQuery.message?.text;
    const note = ctx.t.snoozedUntil(clock(until));
    await ctx.editMessageText(original ? `${original}\n\n${note}` : note);
  });

  mentee.callbackQuery("s:back", (ctx) => showSettings(ctx, ctx.member));

  mentee.callbackQuery("s:time", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(ctx.t.pickHour, { reply_markup: hoursKeyboard(ctx.t) });
  });

  mentee.callbackQuery(/^s:h:(\d+)$/, async (ctx) => {
    const hour = Number(ctx.match[1]);
    if (!PICKER_HOURS.includes(hour)) {
      await ctx.answerCallbackQuery();
      return;
    }
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(ctx.t.pickMinute(String(hour).padStart(2, "0")), {
      reply_markup: minutesKeyboard(ctx.t, hour),
    });
  });

  mentee.callbackQuery(/^s:t:(\d+)$/, async (ctx) => {
    const minutes = Number(ctx.match[1]);
    if (!isPickerTime(minutes)) {
      await ctx.answerCallbackQuery();
      return;
    }
    await skipPassedReminder(ctx.userId, minutes);
    await showSettings(ctx, await db.updateMember(env.DB, ctx.userId, { remind_at: minutes }));
  });

  mentee.callbackQuery("s:days", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(ctx.t.pickDays, { reply_markup: daysKeyboard(ctx.t, ctx.member.weekdays) });
  });

  mentee.callbackQuery(/^s:d:([0-6])$/, async (ctx) => {
    const weekdays = toggleDay(ctx.member.weekdays, Number(ctx.match[1]));
    await db.updateMember(env.DB, ctx.userId, { weekdays });
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: daysKeyboard(ctx.t, weekdays) });
  });

  mentee.callbackQuery("s:msg", async (ctx) => {
    await db.updateMember(env.DB, ctx.userId, { awaiting: "message" });
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(ctx.t.messagePrompt, { reply_markup: messageKeyboard(ctx.t) });
  });

  mentee.callbackQuery("s:msgreset", async (ctx) => {
    const member = await db.updateMember(env.DB, ctx.userId, { message: null, awaiting: null });
    await ctx.answerCallbackQuery(ctx.t.messageReset);
    await ctx.editMessageText(settingsText(ctx.t, member), { reply_markup: settingsKeyboard(ctx.t, member) });
  });

  mentee.callbackQuery(/^s:(pause|resume)$/, async (ctx) => {
    const member = await db.updateMember(env.DB, ctx.userId, { paused: ctx.match[1] === "pause" ? 1 : 0 });
    await showSettings(ctx, member);
  });

  mentee.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (ctx.member.awaiting !== "message" || text.startsWith("/")) {
      await ctx.reply(ctx.t.unknown);
      return;
    }
    if (text.length > MAX_MESSAGE_LENGTH) {
      await ctx.reply(ctx.t.messageTooLong);
      return;
    }
    const member = await db.updateMember(env.DB, ctx.userId, { message: text, awaiting: null });
    await ctx.reply(ctx.t.messageSaved);
    await ctx.reply(settingsText(ctx.t, member), { reply_markup: settingsKeyboard(ctx.t, member) });
  });

  bot.on("message", (ctx) => ctx.reply(ctx.member.role === "mentor" ? ctx.t.mentorNoSettings : ctx.t.unknown));
  bot.on("callback_query", (ctx) => ctx.answerCallbackQuery());

  bot.catch(({ error }) => console.error("Update failed:", error));

  return bot;
}
