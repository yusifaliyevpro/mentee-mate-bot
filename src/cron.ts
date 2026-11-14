import { Api, type InlineKeyboard } from "grammy";
import type { Env } from "./env";
import * as db from "./lib/db";
import { buildDigest, digestDayToSend, digestEntries } from "./lib/digest";
import { messages } from "./lib/i18n";
import { type ActionKind, planTick } from "./lib/schedule";
import { logicalDay, unixSeconds } from "./lib/time";
import { reminderKeyboard } from "./lib/views";

/** Sends a message and reports whether Telegram accepted it; failures are logged, never thrown. */
async function send(api: Api, chatId: number, text: string, keyboard?: InlineKeyboard): Promise<boolean> {
  try {
    await api.sendMessage(chatId, text, keyboard ? { reply_markup: keyboard } : {});
    return true;
  } catch (error) {
    console.error(`Failed to message ${chatId}:`, error);
    return false;
  }
}

/** Re-checks a freshly claimed row, since another run may have finished this send in the meantime. */
function stillDue(kind: ActionKind, row: Awaited<ReturnType<typeof db.claimDay>>): boolean {
  if (!row || row.done_at) return false;
  if (kind === "remind") return !row.reminded_at && !row.skipped_at;
  if (kind === "snooze") return typeof row.snooze_until === "number";
  return !row.nudged_at && typeof row.reminded_at === "number";
}

export async function runTick(env: Env, now: Date, api = new Api(env.BOT_TOKEN)): Promise<void> {
  const settings = await db.getSettings(env.DB);
  const t = messages[settings.lang];
  const { day } = logicalDay(now, env.TIMEZONE);
  const nowSeconds = unixSeconds(now);

  for (const { kind, row } of planTick(await db.reminderRows(env.DB, day), now, env.TIMEZONE)) {
    const claimed = await db.claimDay(env.DB, row.tg_id, day, nowSeconds);
    if (!claimed) continue;
    if (!stillDue(kind, claimed)) {
      await db.setDay(env.DB, row.tg_id, day, { sending_at: null });
      continue;
    }

    const text = kind === "nudge" ? t.nudge : (row.message ?? t.defaultReminder);
    const sent = await send(api, row.tg_id, text, reminderKeyboard(t, day));
    // Only a delivered message counts; otherwise the next run retries while it's still due.
    const delivered = kind === "nudge" ? { nudged_at: nowSeconds } : { reminded_at: nowSeconds, snooze_until: null };
    await db.setDay(env.DB, row.tg_id, day, sent ? { ...delivered, sending_at: null } : { sending_at: null });
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
