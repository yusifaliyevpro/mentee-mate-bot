import { Api, type InlineKeyboard } from "grammy";
import type { Env } from "./env";
import * as db from "./lib/db";
import { buildDigest, digestDayToSend, digestEntries } from "./lib/digest";
import { messages } from "./lib/i18n";
import { planTick } from "./lib/schedule";
import { logicalDay, unixSeconds } from "./lib/time";
import { reminderKeyboard } from "./lib/views";

async function send(api: Api, chatId: number, text: string, keyboard?: InlineKeyboard): Promise<void> {
  try {
    await api.sendMessage(chatId, text, keyboard ? { reply_markup: keyboard } : {});
  } catch (error) {
    // Usually the user blocked the bot; don't let one failure stop the others.
    console.error(`Failed to message ${chatId}:`, error);
  }
}

export async function runTick(env: Env, now: Date): Promise<void> {
  const api = new Api(env.BOT_TOKEN);
  const settings = await db.getSettings(env.DB);
  const t = messages[settings.lang];
  const { day } = logicalDay(now, env.TIMEZONE);
  const nowSeconds = unixSeconds(now);

  for (const { kind, row } of planTick(await db.reminderRows(env.DB, day), now, env.TIMEZONE)) {
    const text = kind === "nudge" ? t.nudge : (row.message ?? t.defaultReminder);
    await send(api, row.tg_id, text, reminderKeyboard(t, day));
    await db.setDay(
      env.DB,
      row.tg_id,
      day,
      kind === "nudge" ? { nudged_at: nowSeconds } : { reminded_at: nowSeconds, snooze_until: null },
    );
  }

  if (settings.digestMode === "off") return;
  const reportDay = digestDayToSend(now, env.TIMEZONE, settings.digestSentDay);
  if (!reportDay) return;
  const mentors = await db.mentorIds(env.DB);
  if (mentors.length === 0) return;

  await db.setSetting(env.DB, "digest_sent_day", reportDay);
  const entries = digestEntries(await db.digestRows(env.DB, reportDay), reportDay);
  const text = buildDigest(entries, settings.digestMode, t, reportDay);
  if (text) for (const mentorId of mentors) await send(api, mentorId, text);
}
