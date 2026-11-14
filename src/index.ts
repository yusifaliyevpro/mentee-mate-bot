import { Api, webhookCallback } from "grammy";
import { createBot } from "./bot";
import { syncCommands } from "./commands";
import { runTick } from "./cron";
import type { Env } from "./env";
import { getSettings, mentorIds } from "./lib/db";

let webhook: { token: string; handle: (request: Request) => Promise<Response> } | undefined;

// Reuse the bot across requests in the same isolate so grammY doesn't call getMe every time.
function webhookHandler(env: Env) {
  if (webhook?.token !== env.BOT_TOKEN) {
    webhook = {
      token: env.BOT_TOKEN,
      handle: webhookCallback(createBot(env), "cloudflare-mod", { secretToken: env.WEBHOOK_SECRET }),
    };
  }
  return webhook.handle;
}

async function setup(env: Env, origin: string): Promise<Response> {
  const api = new Api(env.BOT_TOKEN);
  const url = `${origin}/webhook`;
  await api.setWebhook(url, { secret_token: env.WEBHOOK_SECRET, allowed_updates: ["message", "callback_query"] });
  const { lang } = await getSettings(env.DB);
  await syncCommands(api, lang, Number(env.ADMIN_ID), await mentorIds(env.DB));
  return Response.json({ ok: true, webhook: url });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/webhook") {
      // Checked here because grammY would otherwise call getMe before rejecting the request.
      if (request.headers.get("x-telegram-bot-api-secret-token") !== env.WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
      return webhookHandler(env)(request);
    }
    if (request.method === "POST" && url.pathname === "/setup") {
      if (request.headers.get("x-setup-secret") !== env.WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
      try {
        return await setup(env, url.origin);
      } catch (error) {
        return Response.json({ ok: false, error: String(error) }, { status: 500 });
      }
    }
    return new Response("MenteeMateBot is running.", { status: url.pathname === "/" ? 200 : 404 });
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runTick(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
