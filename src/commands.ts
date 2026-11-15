import type { Api } from "grammy";
import type { Role } from "./lib/db";
import { type Lang, messages } from "./lib/i18n";

const USER_COMMANDS = ["start", "settings", "done", "undone", "pause", "resume", "help"] as const;
const ADMIN_COMMANDS = ["admin", "members", "allow", "mentor", "remove"] as const;
const MENTOR_COMMANDS = ["start", "help"] as const;

type CommandName = keyof (typeof messages)["en"]["commands"];

function list(lang: Lang, names: readonly CommandName[]) {
  return names.map((command) => ({ command, description: messages[lang].commands[command] }));
}

/** Gives one linked member the right menu: start/help for mentors, the default menu for mentees. */
export async function syncMemberCommands(
  api: Api,
  lang: Lang,
  member: { tg_id: number | null; role: Role },
  adminId: number,
): Promise<void> {
  // The admin's chat has its own menu, set by syncCommands.
  if (member.tg_id === null || member.tg_id === adminId) return;
  const scope = { type: "chat", chat_id: member.tg_id } as const;
  try {
    if (member.role === "mentor") await api.setMyCommands(list(lang, MENTOR_COMMANDS), { scope });
    else await api.deleteMyCommands({ scope });
  } catch (error) {
    // Fails with "chat not found" until they've pressed Start; /start retries it.
    console.warn(`Could not set commands for ${member.tg_id}:`, error);
  }
}

/** Updates every "/" menu: the default one, the admin's, and each mentor's. */
export async function syncCommands(api: Api, lang: Lang, adminId: number, mentorIds: number[] = []): Promise<void> {
  await api.setMyCommands(list(lang, USER_COMMANDS));
  for (const tgId of mentorIds) await syncMemberCommands(api, lang, { tg_id: tgId, role: "mentor" }, adminId);
  if (!Number.isSafeInteger(adminId)) return;
  try {
    await api.setMyCommands(list(lang, [...USER_COMMANDS, ...ADMIN_COMMANDS]), {
      scope: { type: "chat", chat_id: adminId },
    });
  } catch (error) {
    // Fails with "chat not found" until the admin has pressed Start; /start retries it.
    console.warn("Could not set admin commands:", error);
  }
}
