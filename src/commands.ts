import type { Api } from "grammy";
import { type Lang, messages } from "./lib/i18n";

const USER_COMMANDS = ["start", "settings", "done", "pause", "resume", "help"] as const;
const ADMIN_COMMANDS = ["admin", "members", "allow", "mentor", "remove"] as const;

/** Updates the "/" menu. Admin commands are only listed in the admin's own chat. */
export async function syncCommands(api: Api, lang: Lang, adminId: number): Promise<void> {
  const descriptions = messages[lang].commands;
  const user = USER_COMMANDS.map((command) => ({ command, description: descriptions[command] }));
  const admin = ADMIN_COMMANDS.map((command) => ({ command, description: descriptions[command] }));
  await api.setMyCommands(user);
  if (Number.isSafeInteger(adminId)) {
    await api.setMyCommands([...user, ...admin], { scope: { type: "chat", chat_id: adminId } });
  }
}
