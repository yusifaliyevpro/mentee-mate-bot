import { type DigestMode, type DigestRow, isDigestMode } from "./digest";
import { type Lang, isLang } from "./i18n";
import type { ScheduleRow } from "./schedule";

export type Role = "mentee" | "mentor";

export interface Member {
  /** Lowercase Telegram username without `@`, or `id:<tg_id>` for the admin when they have none. */
  username: string;
  role: Role;
  tg_id: number | null;
  name: string | null;
  remind_at: number;
  weekdays: number;
  message: string | null;
  paused: number;
  awaiting: string | null;
}

export interface Settings {
  lang: Lang;
  digestMode: DigestMode;
  digestSentDay: string | null;
}

export type ReminderRow = ScheduleRow & { message: string | null };

type MemberUpdate = Partial<Pick<Member, "remind_at" | "weekdays" | "message" | "paused" | "awaiting">>;
type DayUpdate = Partial<Record<"reminded_at" | "snooze_until" | "nudged_at" | "done_at", number | null>>;
type SettingKey = "lang" | "digest_mode" | "digest_sent_day";

export function normalizeUsername(raw: string): string | null {
  const username = raw.trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9_]{4,32}$/.test(username) ? username : null;
}

export function getMemberById(db: D1Database, tgId: number): Promise<Member | null> {
  return db.prepare("SELECT * FROM members WHERE tg_id = ?").bind(tgId).first<Member>();
}

export function claimMember(db: D1Database, username: string, tgId: number, name: string): Promise<Member | null> {
  return db
    .prepare("UPDATE members SET tg_id = ?, name = ? WHERE username = ? AND tg_id IS NULL RETURNING *")
    .bind(tgId, name, username)
    .first<Member>();
}

export function upsertAdmin(db: D1Database, username: string, tgId: number, name: string): Promise<Member | null> {
  return db
    .prepare(
      `INSERT INTO members (username, tg_id, name) VALUES (?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET tg_id = excluded.tg_id, name = excluded.name RETURNING *`,
    )
    .bind(username, tgId, name)
    .first<Member>();
}

export async function updateMember(db: D1Database, tgId: number, update: MemberUpdate): Promise<Member> {
  const keys = Object.keys(update) as (keyof MemberUpdate)[];
  const member = await db
    .prepare(`UPDATE members SET ${keys.map((key) => `${key} = ?`).join(", ")} WHERE tg_id = ? RETURNING *`)
    .bind(...keys.map((key) => update[key] ?? null), tgId)
    .first<Member>();
  if (!member) throw new Error(`Member ${tgId} not found`);
  return member;
}

export async function allowMembers(db: D1Database, usernames: string[], role: Role): Promise<void> {
  await db.batch(
    usernames.map((username) =>
      db
        .prepare(
          "INSERT INTO members (username, role) VALUES (?, ?) ON CONFLICT(username) DO UPDATE SET role = excluded.role",
        )
        .bind(username, role),
    ),
  );
}

export async function removeMember(db: D1Database, username: string): Promise<boolean> {
  const removed = await db
    .prepare("DELETE FROM members WHERE username = ? RETURNING tg_id")
    .bind(username)
    .first<{ tg_id: number | null }>();
  if (!removed) return false;
  if (removed.tg_id !== null) await db.prepare("DELETE FROM days WHERE tg_id = ?").bind(removed.tg_id).run();
  return true;
}

export async function listMembers(db: D1Database): Promise<Member[]> {
  const { results } = await db.prepare("SELECT * FROM members ORDER BY role DESC, username").all<Member>();
  return results;
}

export async function mentorIds(db: D1Database): Promise<number[]> {
  const { results } = await db
    .prepare("SELECT tg_id FROM members WHERE role = 'mentor' AND tg_id IS NOT NULL")
    .all<{ tg_id: number }>();
  return results.map((row) => row.tg_id);
}

export function getDay(db: D1Database, tgId: number, day: string): Promise<DayUpdate | null> {
  return db.prepare("SELECT * FROM days WHERE tg_id = ? AND day = ?").bind(tgId, day).first<DayUpdate>();
}

export async function setDay(db: D1Database, tgId: number, day: string, update: DayUpdate): Promise<void> {
  const keys = Object.keys(update) as (keyof DayUpdate)[];
  await db
    .prepare(
      `INSERT INTO days (tg_id, day, ${keys.join(", ")}) VALUES (?, ?, ${keys.map(() => "?").join(", ")})
       ON CONFLICT(tg_id, day) DO UPDATE SET ${keys.map((key) => `${key} = excluded.${key}`).join(", ")}`,
    )
    .bind(tgId, day, ...keys.map((key) => update[key] ?? null))
    .run();
}

export async function reminderRows(db: D1Database, day: string): Promise<ReminderRow[]> {
  const { results } = await db
    .prepare(
      `SELECT m.tg_id, m.remind_at, m.weekdays, m.paused, m.message,
              d.reminded_at, d.snooze_until, d.nudged_at, d.done_at
       FROM members m LEFT JOIN days d ON d.tg_id = m.tg_id AND d.day = ?
       WHERE m.role = 'mentee' AND m.tg_id IS NOT NULL`,
    )
    .bind(day)
    .all<ReminderRow>();
  return results;
}

export async function digestRows(db: D1Database, day: string): Promise<DigestRow[]> {
  const { results } = await db
    .prepare(
      `SELECT m.username, m.name, m.weekdays, m.paused, d.done_at
       FROM members m LEFT JOIN days d ON d.tg_id = m.tg_id AND d.day = ?
       WHERE m.role = 'mentee' AND m.tg_id IS NOT NULL
       ORDER BY COALESCE(m.name, m.username)`,
    )
    .bind(day)
    .all<DigestRow>();
  return results;
}

export async function getSettings(db: D1Database): Promise<Settings> {
  const { results } = await db.prepare("SELECT key, value FROM settings").all<{ key: SettingKey; value: string }>();
  const values = new Map(results.map((row) => [row.key, row.value]));
  const lang = values.get("lang");
  const digestMode = values.get("digest_mode");
  return {
    lang: isLang(lang) ? lang : "az",
    digestMode: isDigestMode(digestMode) ? digestMode : "off",
    digestSentDay: values.get("digest_sent_day") ?? null,
  };
}

export async function setSetting(db: D1Database, key: SettingKey, value: string): Promise<void> {
  await db
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, value)
    .run();
}
