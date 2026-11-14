import { Api, type Bot } from "grammy";
import type { Message, Update, User } from "grammy/types";
import { vi } from "vitest";
import { type BotContext, createBot } from "../../src/bot";
import { runTick } from "../../src/cron";
import type { Env } from "../../src/env";
import type { Member } from "../../src/lib/db";
import { baku } from "../helpers";
import { FakeD1 } from "./fake-d1";
import { BOT_ID, FakeTelegram } from "./fake-telegram";

export type TestUser = Pick<User, "id" | "first_name" | "username">;

export const ADMIN: TestUser = { id: 1000, first_name: "Yusif", username: "YusifAliyevPro" };
export const AYSEL: TestUser = { id: 1, first_name: "Aysel", username: "aysel_m" };
export const MURAD: TestUser = { id: 2, first_name: "Murad", username: "murad_k" };
export const NIGAR: TestUser = { id: 3, first_name: "Nigar", username: "nigar_a" };
export const MENTOR: TestUser = { id: 50, first_name: "Leyla", username: "leyla_mentor" };
export const STRANGER: TestUser = { id: 666, first_name: "Stranger", username: "random_guy" };

export interface DayRow {
  tg_id: number;
  day: string;
  reminded_at: number | null;
  snooze_until: number | null;
  nudged_at: number | null;
  done_at: number | null;
}

export class Harness {
  readonly db = new FakeD1();
  readonly telegram = new FakeTelegram();
  readonly env: Env = {
    DB: this.db.asD1(),
    BOT_TOKEN: "123456:TEST",
    WEBHOOK_SECRET: "secret",
    ADMIN_ID: String(ADMIN.id),
    TIMEZONE: "Asia/Baku",
  };
  readonly bot: Bot<BotContext> = createBot(this.env);
  private updateId = 1;

  static async create(local = "2026-11-14 12:00"): Promise<Harness> {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(baku(local));
    const harness = new Harness();
    harness.telegram.install(harness.bot.api);
    await harness.bot.init();
    harness.telegram.clear();
    return harness;
  }

  /** Moves the clock to a Baku wall-clock time. */
  at(local: string): this {
    vi.setSystemTime(baku(local));
    return this;
  }

  async send(user: TestUser, text: string, chatType: "private" | "group" = "private"): Promise<void> {
    const command = /^\/\w+/.exec(text)?.[0];
    const chat: Message["chat"] =
      chatType === "private"
        ? { id: user.id, type: "private", first_name: user.first_name }
        : { id: -100, type: "group", title: "Mentees" };
    const message: Message.TextMessage = {
      message_id: this.updateId,
      date: Math.floor(Date.now() / 1000),
      chat,
      from: { ...user, is_bot: false },
      text,
      ...(command ? { entities: [{ type: "bot_command", offset: 0, length: command.length }] } : {}),
    };
    await this.bot.handleUpdate({ update_id: this.updateId++, message } as Update);
  }

  /** Taps an inline button with `data` on a bot message whose text is `messageText`. */
  async tap(user: TestUser, data: string, messageText = "message"): Promise<void> {
    const message: Message.TextMessage = {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: user.id, type: "private", first_name: user.first_name },
      from: { id: BOT_ID, is_bot: true, first_name: "MenteeMateBot" },
      text: messageText,
    };
    await this.bot.handleUpdate({
      update_id: this.updateId++,
      callback_query: {
        id: String(this.updateId),
        from: { ...user, is_bot: false },
        chat_instance: "instance",
        data,
        message,
      },
    } satisfies Update);
  }

  /** Runs one cron tick at a Baku wall-clock time. */
  async tick(local: string): Promise<void> {
    const now = baku(local);
    vi.setSystemTime(now);
    const api = new Api(this.env.BOT_TOKEN);
    this.telegram.install(api);
    await runTick(this.env, now, api);
  }

  /** Runs a cron tick for every minute from `from` to `to` (inclusive), like the real `* * * * *` trigger. */
  async tickEveryMinute(from: string, to: string): Promise<void> {
    for (let at = baku(from).getTime(); at <= baku(to).getTime(); at += 60_000) {
      const now = new Date(at);
      vi.setSystemTime(now);
      const api = new Api(this.env.BOT_TOKEN);
      this.telegram.install(api);
      await runTick(this.env, now, api);
    }
  }

  /** Allowlists users through the real admin command and has them press Start. */
  async onboard(...users: TestUser[]): Promise<void> {
    await this.send(ADMIN, `/allow ${users.map((user) => `@${user.username}`).join(" ")}`);
    for (const user of users) await this.send(user, "/start");
    this.telegram.clear();
  }

  async onboardMentor(user: TestUser = MENTOR): Promise<void> {
    await this.send(ADMIN, `/mentor @${user.username}`);
    await this.send(user, "/start");
    this.telegram.clear();
  }

  member(user: TestUser): Member | undefined {
    return this.db.query<Member>("SELECT * FROM members WHERE tg_id = ?", user.id)[0];
  }

  memberByUsername(username: string): Member | undefined {
    return this.db.query<Member>("SELECT * FROM members WHERE username = ?", username)[0];
  }

  day(user: TestUser, day: string): DayRow | undefined {
    return this.db.query<DayRow>("SELECT * FROM days WHERE tg_id = ? AND day = ?", user.id, day)[0];
  }

  setting(key: string): string | undefined {
    return this.db.query<{ value: string }>("SELECT value FROM settings WHERE key = ?", key)[0]?.value;
  }

  lastEditText(): string | undefined {
    const text = this.telegram.lastEdit()?.text;
    return typeof text === "string" ? text : undefined;
  }

  /** Updates a member row directly, for setting up a scenario quickly. */
  update(user: TestUser, fields: Partial<Record<keyof Member, string | number | null>>): void {
    const keys = Object.keys(fields);
    this.db.exec(
      `UPDATE members SET ${keys.map((key) => `${key} = ?`).join(", ")} WHERE tg_id = ?`,
      ...keys.map((key) => fields[key as keyof Member] ?? null),
      user.id,
    );
  }
}
