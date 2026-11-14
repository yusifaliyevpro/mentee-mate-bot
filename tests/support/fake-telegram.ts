import type { Api, RawApi } from "grammy";

export const BOT_ID = 999;

export interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

type Failure = { error_code: number; description: string };

/** Records every Bot API call instead of sending it, and returns plausible results. */
export class FakeTelegram {
  calls: ApiCall[] = [];
  private failures = new Map<string, (payload: Record<string, unknown>) => Failure | undefined>();
  private nextMessageId = 1;

  install(api: Api): void {
    api.config.use(async (_prev, method, payload) => {
      const body = (payload ?? {}) as Record<string, unknown>;
      this.calls.push({ method, payload: body });
      const failure = this.failures.get(method)?.(body);
      if (failure) return { ok: false, ...failure } as never;
      return { ok: true, result: this.result(method, body) } as never;
    });
  }

  /** Makes calls to `method` fail when `when` returns a failure for their payload. */
  failWhen(method: keyof RawApi, when: (payload: Record<string, unknown>) => Failure | undefined): void {
    this.failures.set(method, when);
  }

  clear(): void {
    this.calls = [];
  }

  callsTo(method: keyof RawApi): Record<string, unknown>[] {
    return this.calls.filter((call) => call.method === method).map((call) => call.payload);
  }

  /** Payloads of messages sent to `chatId`, in order. */
  messagesTo(chatId: number): Record<string, unknown>[] {
    return this.callsTo("sendMessage").filter((payload) => payload.chat_id === chatId);
  }

  /** Chats that received a message, in order, optionally leaving some out. */
  recipients(...except: number[]): unknown[] {
    return this.callsTo("sendMessage")
      .map((payload) => payload.chat_id)
      .filter((chatId) => !except.includes(chatId as number));
  }

  /** Texts of messages sent to `chatId`, in order. */
  sentTo(chatId: number): string[] {
    return this.callsTo("sendMessage")
      .filter((payload) => payload.chat_id === chatId)
      .map((payload) => String(payload.text));
  }

  lastEdit(): Record<string, unknown> | undefined {
    return this.calls.filter((call) => call.method.startsWith("editMessage")).at(-1)?.payload;
  }

  answers(): (string | undefined)[] {
    return this.callsTo("answerCallbackQuery").map((payload) => payload.text as string | undefined);
  }

  private result(method: string, payload: Record<string, unknown>): unknown {
    switch (method) {
      case "getMe":
        return {
          id: BOT_ID,
          is_bot: true,
          first_name: "MenteeMateBot",
          username: "menteemate_bot",
          can_join_groups: false,
          can_read_all_group_messages: false,
          supports_inline_queries: false,
          can_connect_to_business: false,
          has_main_web_app: false,
        };
      case "sendMessage":
        return {
          message_id: this.nextMessageId++,
          date: Math.floor(Date.now() / 1000),
          chat: { id: payload.chat_id, type: "private" },
          text: payload.text,
        };
      default:
        return true;
    }
  }
}

/** Callback data of every button in a reply markup. */
export function buttonData(markup: unknown): string[] {
  const rows = (markup as { inline_keyboard?: { callback_data?: string }[][] } | undefined)?.inline_keyboard ?? [];
  return rows.flat().map((button) => button.callback_data ?? "");
}

export function buttonLabels(markup: unknown): string[] {
  const rows = (markup as { inline_keyboard?: { text: string }[][] } | undefined)?.inline_keyboard ?? [];
  return rows.flat().map((button) => button.text);
}
