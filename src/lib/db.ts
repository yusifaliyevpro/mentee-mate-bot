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
  /** The role they were last welcomed as; a repeat /start skips the welcome while it matches. */
  welcomed_role: Role | null;
}

export interface Settings {
  lang: Lang;
  digestMode: DigestMode;
  digestSentDay: string | null;
}

export type ReminderRow = ScheduleRow & { message: string | null };

const MEMBER_FIELDS = ["remind_at", "weekdays", "message", "paused", "awaiting", "welcomed_role"] as const;
const DAY_FIELDS = ["reminded_at", "skipped_at", "snooze_until", "nudged_at", "done_at"] as const;

type MemberUpdate = Partial<Pick<Member, (typeof MEMBER_FIELDS)[number]>>;
type DayUpdate = Partial<Record<(typeof DAY_FIELDS)[number], number | null>>;
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

/**
 * Keeps the stored username and name in step with Telegram. Telegram usernames are unique, so an
 * unclaimed allowlist entry for the new username is this same person and gets merged in.
 */
export async function syncProfile(
  db: D1Database,
  member: Member,
  rawUsername: string | undefined,
  name: string,
): Promise<Member> {
  const username = rawUsername?.toLowerCase();
  const usernameChanged = username !== undefined && username !== member.username;
  if (!usernameChanged && name === member.name) return member;

  let next = { username: member.username, role: member.role };
  if (usernameChanged) {
    const other = await db
      .prepare("SELECT role, tg_id FROM members WHERE username = ?")
      .bind(username)
      .first<{ role: Role; tg_id: number | null }>();
    if (!other) {
      next = { ...next, username };
    } else if (other.tg_id === null) {
      // The admin allowlisted the new username too; their latest choice of role wins.
      await db.prepare("DELETE FROM members WHERE username = ?").bind(username).run();
      next = { username, role: other.role };
    }
    // Otherwise another linked account still holds it in our records (they renamed too); keep ours.
  }

  const updated = await db
    .prepare("UPDATE members SET username = ?, role = ?, name = ? WHERE tg_id = ? RETURNING *")
    .bind(next.username, next.role, name, member.tg_id)
    .first<Member>();
  return updated ?? member;
}

export async function updateMember(db: D1Database, tgId: number, update: MemberUpdate): Promise<Member> {
  const keys = MEMBER_FIELDS.filter((key) => key in update);
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

export async function removeMember(db: D1Database, username: string): Promise<{ tg_id: number | null } | null> {
  const removed = await db
    .prepare("DELETE FROM members WHERE username = ? RETURNING tg_id")
    .bind(username)
    .first<{ tg_id: number | null }>();
  if (removed && removed.tg_id !== null) await db.prepare("DELETE FROM days WHERE tg_id = ?").bind(removed.tg_id).run();
  return removed;
}

export function getMemberByUsername(db: D1Database, username: string): Promise<Member | null> {
  return db.prepare("SELECT * FROM members WHERE username = ?").bind(username).first<Member>();
}

export async function listMembers(db: D1Database): Promise<Member[]> {
  const { results } = await db.prepare("SELECT * FROM members ORDER BY created_at, rowid").all<Member>();
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
  const keys = DAY_FIELDS.filter((key) => key in update);
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
              d.reminded_at, d.skipped_at, d.snooze_until, d.nudged_at, d.done_at
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
