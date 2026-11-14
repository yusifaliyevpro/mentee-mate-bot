# AGENTS.md

Context for AI coding agents working on MenteeMateBot. Read this before changing anything.

## What this is

A private Telegram bot for a mentorship group. Each mentee gets a daily reminder, at a time they choose, to spend 5–10 minutes writing down their thoughts. They tap **✅ Done** when finished. The admin can turn on a 10:00 summary for the mentor. Open source under AGPL-3.0-or-later.

Everything happens inside Telegram (inline keyboards). There is deliberately no website or login.

## Stack

- **Runtime:** Cloudflare Workers (free plan). Telegram updates arrive via webhook at `POST /webhook`, and a cron trigger runs every minute.
- **Bot framework:** [grammY](https://grammy.dev).
- **Database:** Cloudflare D1 (SQLite), bound as `env.DB`. The schema lives in `migrations/`.
- **Tooling:** TypeScript, oxfmt, oxlint (type-aware), vitest, and greenly (`pnpm check`).

## Layout

```
src/
  index.ts      Worker entry: /webhook, /setup, the scheduled() handler
  bot.ts        All Telegram handlers (middleware, admin, mentee, settings)
  cron.ts       runTick(): one cron run (reminders, snoozes, nudge, mentor summary)
  commands.ts   "/" menu for users, plus admin-only commands in the admin's chat
  env.ts        Env bindings
  lib/
    time.ts     Timezone math, the 04:00 day boundary, constants
    schedule.ts planTick(): pure decision of what a tick sends
    digest.ts   Mentor summary building (pure)
    db.ts       All SQL
    views.ts    Message texts and inline keyboards (pure)
    i18n.ts     Azerbaijani and English strings
migrations/     D1 migrations, applied in filename order
tests/          vitest suites; tests/support/ has the fakes and harness
```

## Domain rules

- **The day runs 04:00 → 04:00** local time (`DAY_START_HOUR`). Notes written at 01:30 count for the previous day. "Logical day" in the code means this.
- **Timezone:** `TIMEZONE` var, default `Asia/Baku`. Times in the DB are minutes since local midnight (`remind_at`) or unix seconds (`days.*_at`).
- **Reminder times:** the picker offers 06:00–23:45 in 15-minute steps.
- **Catch-up and delivery:** if cron misses the exact minute, a reminder can still go out up to 15 minutes late. A message only counts as sent once Telegram accepts it; a failed send is retried every minute within that 15-minute window (snoozes too, measured from when they were due), then dropped.
- **No duplicates:** each send is claimed first with `claimDay` (`days.sending_at`), so overlapping cron runs can't both send it. A claim older than 2 minutes is treated as abandoned.
- **Registering or picking a time that already passed today:** the reminder starts tomorrow, with no immediate catch-up.
- **Picking a later time today:** this re-arms today's reminder and replaces a pending snooze, unless the day is already done.
- **Snooze:** 30 or 60 minutes only, and never past 04:00.
- **23:50 nudge:** only goes to someone who was actually sent a reminder that day and isn't done. It's skipped if that reminder went out less than an hour earlier, or a snooze is pending. A reminder skipped because its time had passed is stored in `days.skipped_at`, never in `reminded_at`, so it doesn't count.
- **Mentor summary at 10:00:** covers the previous logical day. The mode (`off` / `count` / `names`) is admin-only and the mentor never sees it. Days off and paused mentees show as 💤. Someone who wasn't sent a reminder that day (joined late, time already passed, delivery failed) and didn't write is left out entirely, so the total shrinks (e.g. 4/4). If nobody counts, no summary is sent.
- **Wording:** messages say the day ends at night: "gecə saat 04:00" in Azerbaijani and "4 AM" in English (a test enforces this).
- **Access:**
  - The admin is identified by numeric `ADMIN_ID` and auto-registered as a mentee.
  - Everyone else needs an allowlisted username (`/allow`).
  - The first Start links the entry to the user's Telegram ID. After that, users are matched by ID, and username and name changes are synced on every update.
- **Roles:** `mentee` gets reminders. `mentor` gets only the summary. `/mentor @x` allowlists and sets the role in one step.
- **First messages on /start:**
  - Mentee: welcome, unmute tip, then settings (settings last, so the keyboard sits at the bottom).
  - Mentor: welcome, an explanation of how the bot works (`mentorIntro`, also their `/help`), then the unmute tip.
  - The mentor is never told the summary mode.
  - These only go out the first time, tracked per role in `welcomed_role`. A repeat `/start` shows just the settings (mentee) or `mentorIntro` (mentor). A role change welcomes them once in the new role.
- **"/" menus:**
  - The default menu has the mentee commands.
  - The admin's chat adds the admin commands.
  - Each mentor's chat has only `/start` and `/help`.
  - Per-chat menus are stored by Telegram, so `commands.ts` must re-sync them whenever a role changes (`/mentor`, `/allow`, `/remove`, a username merge) or the language changes.
- **Language:** one global setting (`az` default, or `en`), chosen by the admin. Every string must exist in both languages in `i18n.ts`. Azerbaijani addresses mentees informally (`sən`).

## Commands

Always use `pnpm` / `pnpx`, never `npm` / `npx`. Local binaries run as `pnpm <bin>`.

```bash
pnpm test          # vitest
pnpm fmt           # format (run before pnpm check)
pnpm check         # typecheck, format check, lint, tests (greenly); must pass before committing
pnpm wrangler deploy
pnpm db:migrate    # apply migrations to the remote D1
```

`pnpm deploy` is a built-in pnpm command, so use `pnpm wrangler deploy`.

## Development workflow (test-driven)

- **Bug or regression reported:** first write a test that reproduces it, run it and confirm it **fails**, then fix the code until it passes. Don't fix first and test after.
- **New feature requested:** build the feature, then write a test suite for it that covers the main flow and its edge cases.
- Finish every change with `pnpm fmt` then `pnpm check`. Both must be clean, with no warnings.

### How the tests work

- Pure logic (`time`, `schedule`, `digest`, `views`) is unit-tested directly.
- Handlers and cron are tested end to end with `tests/support/harness.ts`:
  - **Database:** `FakeD1` is in-memory `node:sqlite` with the real migrations applied.
  - **Telegram:** `FakeTelegram` records every Bot API call through a grammY transformer. `failWhen()` simulates errors.
  - **Users and time:**
    - `h.send(user, text)` and `h.tap(user, callbackData)` simulate users.
    - `h.at("2026-11-14 21:05")` moves the clock.
    - `h.tick(...)` / `h.tickEveryMinute(from, to)` run the real cron.
  - `h.onboard(...)` allowlists users and presses Start for them.
- The admin is a mentee too, so they also receive reminders in tests. Filter by recipient (`sentTo`, `recipients(ADMIN.id)`).
- 2026-11-14 is a Saturday (weekday index 5; Monday = 0).

## Conventions and pitfalls

- **Comments:** short (one line, two at most), and only for the non-obvious _why_.
- **No AI attribution** anywhere: commits, PRs or files.
- **Migrations:** never edit an applied migration. Add a new numbered file in `migrations/`, test any data backfill in `tests/migrations.test.ts` (`new FakeD1(n)` stops after `n` migrations, then `migrate()`), and run `pnpm db:migrate` before `pnpm wrangler deploy`.
- **Error handling:** handlers are registered on `app = bot.errorBoundary(...)`, not on `bot`. In webhook mode an uncaught error makes Telegram retry the same update. Keep new handlers on `app` or its filters.
- **Webhook secret:** `/webhook` checks Telegram's secret header itself, before grammY runs, because grammY would call `getMe` first.
- **Callback data** must stay within Telegram's 64 bytes (a test enforces this).
- **Editing messages:** editing a message to identical content makes Telegram return an error. Skip no-op edits.
- **Secrets:** `BOT_TOKEN`, `WEBHOOK_SECRET` and `ADMIN_ID` are Worker secrets (`pnpm wrangler secret put`). `.env` is only for local `pnpm dev`. After deploying to a new URL, call `POST /setup` with the `x-setup-secret` header.
