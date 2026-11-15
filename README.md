<h1>
  <img src="assets/logo.svg" alt="" height="34" align="top" />
  MenteeMateBot
</h1>

[![CI](https://github.com/yusifaliyevpro/mentee-mate-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/yusifaliyevpro/mentee-mate-bot/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-AGPL--3.0-3fb950)](LICENSE)

> A Telegram bot that reminds mentees to write their daily notes, each at a time they choose, and can send their mentor a short summary every morning.

Built for mentorship groups where the mentor asks everyone to spend 5–10 minutes a day writing down their thoughts. Instead of one person posting the same reminder in the group chat, each mentee gets a private reminder at a time that suits them.

## Features

- **Personal reminders.** Each mentee picks their own time (06:00–23:45, in 15-minute steps), which weekdays to get reminders on, and the reminder text.
- **One tap to mark done.** Reminders come with **✅ Done**, **⏰ 30 min** and **⏰ 1 hour** buttons. `/done` marks the day before the reminder even arrives.
- **Late-night friendly.** A day runs from 04:00 to 04:00, so notes written after midnight still count.
- **23:50 nudge.** Mentees who got a reminder that day but haven't tapped Done get a gentle "you have until 04:00" message.
- **Flexible.** Moving the reminder to later today re-arms today's reminder, and a time that has already passed starts tomorrow.
- **Mentor summary at 10:00.** Covers the previous day. The admin chooses whether it's off, shows counts only, or lists names, and the mentor is never told which. Mentees who had a day off are shown as 💤, and anyone who wasn't sent a reminder that day isn't counted at all.
- **Private.** Only usernames on the admin's allowlist can use the bot.
- **Azerbaijani and English.** The admin picks the language for the whole bot.
- **No website, no login.** Everything happens in Telegram, with inline buttons.

## How it works

The bot runs on [Cloudflare Workers](https://workers.dev) (free plan) with [grammY](https://grammy.dev) and a [D1](https://developers.cloudflare.com/d1/) database:

- Telegram sends updates to the worker's `/webhook` endpoint.
- A cron trigger runs **every minute** and sends any due reminders, snoozes, nudges and the mentor summary.

## Usage

### Mentees

| Command     | What it does                                                    |
| ----------- | --------------------------------------------------------------- |
| `/start`    | First time: welcome and settings. After that: just the settings |
| `/settings` | Change reminder time, days and text                             |
| `/done`     | Mark today as written (no reminder needed)                      |
| `/pause`    | Pause reminders (vacation, exams…)                              |
| `/resume`   | Turn reminders back on                                          |
| `/cancel`   | Stop editing the reminder text without changing it              |
| `/help`     | How it works                                                    |

### Mentor

The mentor doesn't get reminders, so their "/" menu only has `/start` and `/help`. On the first `/start` they get a welcome and an explanation of how the bot works. `/help` repeats that explanation. They receive the morning summary when the admin turns it on.

### Admin

The admin is the Telegram user whose numeric ID is set in `ADMIN_ID`. They're registered as a mentee automatically, so they get reminders too. These commands only work for the admin and only show up in the admin's "/" menu.

| Command                  | What it does                                                     |
| ------------------------ | ---------------------------------------------------------------- |
| `/admin`                 | Bot language and mentor summary mode                             |
| `/allow @user1 @user2 …` | Add mentees to the allowlist (also turns a mentor back into one) |
| `/mentor @user`          | Set the mentor, adding them to the allowlist if needed           |
| `/remove @user`          | Remove someone and their history                                 |
| `/members`               | List everyone in the order they were added, and their status     |

The allowlist uses usernames, but pressing **Start** links each person to their Telegram account. After that, username and name changes are picked up automatically. Someone who changes their username _before_ pressing Start is told their current username, so they can send it to the admin to add.

## Self-hosting

You need a Telegram account, a free [Cloudflare](https://dash.cloudflare.com/sign-up) account, Node.js 24+ and pnpm.

1. **Create the bot.** Message [@BotFather](https://t.me/BotFather), send `/newbot`, and copy the token.
2. **Find your Telegram ID.** Message [@userinfobot](https://t.me/userinfobot), which replies with your numeric ID.
3. **Install and create the database:**

   ```bash
   pnpm install
   pnpm wrangler d1 create mentee-mate-bot
   ```

   Put the printed `database_id` into `wrangler.jsonc`, keeping the binding name `DB`.

4. **Apply the schema:**

   ```bash
   pnpm db:migrate
   ```

5. **Set the secrets.** For `WEBHOOK_SECRET`, use any random string of letters, digits, `_` or `-`, for example from `openssl rand -hex 32`.

   ```bash
   pnpm wrangler secret put BOT_TOKEN
   pnpm wrangler secret put WEBHOOK_SECRET
   pnpm wrangler secret put ADMIN_ID
   ```

6. **Deploy:**

   ```bash
   pnpm wrangler deploy
   ```

7. **Connect Telegram to the worker.** This sets the webhook and the command menus:

   ```bash
   curl -X POST https://mentee-mate-bot.<your-subdomain>.workers.dev/setup -H "x-setup-secret: <WEBHOOK_SECRET>"
   ```

8. **Give the bot a face (optional).** In @BotFather:
   - `/setuserpic`: send [`assets/avatar.png`](assets/avatar.png) as a photo.
   - `/setabouttext`: a one-line tagline for the bot's profile.
   - `/setdescription`: what people see in the empty chat before they press Start.

9. **Open the bot in Telegram and press Start.** Then:
   - add mentees with `/allow @username …`
   - set the mentor with `/mentor @username`
   - choose a language and summary mode in `/admin`

   Share `https://t.me/<your_bot_username>` and ask everyone to press **Start** once.

Timezone defaults to `Asia/Baku`. Change `TIMEZONE` in `wrangler.jsonc` to any [IANA timezone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones).

### Updating

After pulling new changes, apply any new migrations first, then deploy:

```bash
pnpm db:migrate
pnpm wrangler deploy
```

Use `pnpm wrangler deploy`, not `pnpm deploy`, which is a different, built-in pnpm command.

## Development

```bash
cp .env.example .env   # fill in a test bot's token
pnpm db:migrate:local
pnpm dev
```

- **Trigger a cron tick locally:** `curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"`.
- **Receive real Telegram updates locally:** expose the dev server with a tunnel (e.g. `cloudflared tunnel --url http://localhost:8787`) and call `/setup` on the tunnel URL.

Run all checks (typecheck, format, lint, tests) with:

```bash
pnpm check
```

Tests drive the real bot handlers and cron against an in-memory SQLite database (with the real migrations) and a fake Telegram API, so whole days can be simulated minute by minute. See `tests/support/`.

## License

[AGPL-3.0-or-later](LICENSE) © [Yusif Aliyev](https://yusifaliyevpro.com)
