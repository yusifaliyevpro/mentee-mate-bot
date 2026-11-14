import { describe, expect, it } from "vitest";
import type { Env } from "../src/env";
import worker from "../src/index";
import { FakeD1 } from "./support/fake-d1";

const env: Env = {
  DB: new FakeD1().asD1(),
  BOT_TOKEN: "123456:TEST",
  WEBHOOK_SECRET: "secret",
  ADMIN_ID: "1000",
  TIMEZONE: "Asia/Baku",
};

const request = (path: string, init?: RequestInit) =>
  worker.fetch(new Request(`https://bot.example${path}`, init) as Parameters<typeof worker.fetch>[0], env);

describe("HTTP entry point", () => {
  it("answers on the root URL", async () => {
    const response = await request("/");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("MenteeMateBot is running.");
  });

  it("returns 404 for unknown paths and wrong methods", async () => {
    expect((await request("/nope")).status).toBe(404);
    expect((await request("/setup")).status).toBe(404);
    expect((await request("/webhook")).status).toBe(404);
  });

  it("refuses /setup without the right secret", async () => {
    expect((await request("/setup", { method: "POST" })).status).toBe(401);
    expect((await request("/setup", { method: "POST", headers: { "x-setup-secret": "wrong" } })).status).toBe(401);
  });

  it("refuses webhook calls without Telegram's secret token", async () => {
    const response = await request("/webhook", { method: "POST", body: "{}" });
    expect(response.status).toBe(401);
  });
});
