import type { DigestMode } from "./digest";

export type Lang = "az" | "en";
export const LANGS: Lang[] = ["az", "en"];
export const LANG_NAMES: Record<Lang, string> = { az: "🇦🇿 Azərbaycanca", en: "🇬🇧 English" };

const en = {
  notAllowed: (username: string | undefined) =>
    username
      ? `Sorry, this bot is private. Ask your group admin to add you by sending them your username: @${username}`
      : "Sorry, this bot is private. Set a username in Telegram settings first, then ask your group admin to add you.",
  welcome: (name: string) =>
    `Hi ${name}! 👋\n\nI'll remind you every day to write down your thoughts. Pick the time and days that suit you below. You can change them anytime with /settings.`,
  mentorWelcome: (name: string) => `Hi ${name}! 👋 You're all set.`,
  mentorIntro:
    "Here's how it works:\n\n• Each mentee gets a daily reminder, at a time they choose, to spend 5–10 minutes writing their notes. They tap ✅ Done when they've written.\n• A day lasts until 04:00, so notes written after midnight still count.\n• When the admin enables it, you'll get a short summary here every morning at 10:00 about the previous day.\n\nThere's nothing you need to set up. Send /help anytime to see this again.",
  mentorNoSettings:
    "Reminders are only for mentees, so there's nothing to set up here. Send /help to see how it works.",
  unmuteTip:
    "🔔 Important: if this chat is muted, unmute it (tap ⋮ or the bot's name at the top → Unmute) so my messages reach you even when Telegram is closed.",
  mentorUnmuteTip:
    "🔔 Important: if this chat is muted, unmute it (tap ⋮ or the bot's name at the top → Unmute) so my messages reach you even when Telegram is closed.",
  help: "📝 I send you a daily reminder to write your notes.\n\n/settings: reminder time, days and text\n/done: mark today as written\n/pause: pause reminders\n/resume: resume reminders\n\nA day lasts until 04:00, so writing after midnight still counts.",
  unknown: "Use /settings to change your reminders or /help to see what I can do.",

  defaultReminder: "📝 Time for today's notes! Take 5–10 minutes to write down what's on your mind.",
  nudge: "🌙 Don't forget today's notes. You have until 04:00.",
  btnDone: "✅ Done",
  btnSnooze: (minutes: number) => (minutes === 60 ? "⏰ 1 hour" : `⏰ ${minutes} min`),
  doneAt: (time: string) => `✅ Done at ${time}. Well done!`,
  markedDone: "✅ Marked today as written. Well done!",
  alreadyDone: "Already marked as done ✅",
  dayOver: "That day is already over.",
  snoozedUntil: (time: string) => `⏰ OK, I'll remind you again at ${time}.`,
  snoozeTooLate: "Too late to snooze: the day ends at 04:00.",

  settingsTitle: "⚙️ Your settings",
  settingTime: "⏰ Time",
  settingDays: "📅 Days",
  settingMessage: "💬 Message",
  settingStatus: "Status",
  everyDay: "every day",
  noDays: "none",
  active: "▶️ active",
  pausedStatus: "⏸ paused",
  weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  btnTime: "⏰ Time",
  btnDays: "📅 Days",
  btnMessage: "💬 Message",
  btnPause: "⏸ Pause",
  btnResume: "▶️ Resume",
  btnBack: "« Back",
  btnResetMessage: "↩️ Use default",
  pickHour: "Pick the hour:",
  pickMinute: (hour: string) => `Pick the minute (${hour}:__):`,
  pickDays: "Tap a day to turn its reminder on or off:",
  messagePrompt:
    "Send me the text you'd like to get as your reminder (up to 500 characters).\n\nSend /cancel to keep the current one.",
  messageSaved: "💬 Saved your reminder text.",
  messageReset: "💬 Back to the default text.",
  messageTooLong: "That's too long. Please keep it under 500 characters.",
  cancelled: "OK, nothing changed.",
  paused: "⏸ Reminders paused. Send /resume when you're back.",
  resumed: "▶️ Reminders are back on.",

  adminTitle: "🛠 Admin",
  adminLanguage: "Bot language",
  adminDigest: "Mentor summary",
  adminMentor: "Mentor",
  adminMentees: "Mentees",
  notSet: "not set",
  digestModes: { off: "Off", count: "Count only", names: "With names" } satisfies Record<DigestMode, string>,
  adminHelp:
    "/allow @user …: add mentees\n/mentor @user: set the mentor\n/remove @user: remove someone\n/members: list everyone",
  usageAllow: "Usage: /allow @username [@username …]",
  usageMentor: "Usage: /mentor @username",
  usageRemove: "Usage: /remove @username",
  allowed: (names: string[]) => `✅ Added: ${names.join(", ")}\nThey can now open the bot and press Start.`,
  mentorSet: (name: string) => `✅ ${name} is now the mentor. They need to open the bot and press Start once.`,
  removed: (name: string) => `🗑 Removed ${name}.`,
  notFound: (name: string) => `${name} isn't on the list.`,
  membersTitle: "👥 Members",
  mentorTag: "mentor",
  notStarted: "hasn't pressed Start yet",
  noMembers: "Nobody yet. Add mentees with /allow @username.",

  digestTitle: (date: string) => `📊 Notes for ${date}`,
  digestCount: (done: number, total: number) => `✍️ ${done}/${total} wrote their notes.`,
  digestOffCount: (count: number) => `💤 ${count} had a day off.`,
  digestDone: "✅ Wrote",
  digestMissed: "⏳ Didn't write",
  digestOff: "💤 Day off",

  commands: {
    start: "Start the bot",
    settings: "Reminder settings",
    done: "Mark today as written",
    pause: "Pause reminders",
    resume: "Resume reminders",
    help: "How it works",
    admin: "Admin panel",
    members: "List members",
    allow: "Add mentees",
    mentor: "Set the mentor",
    remove: "Remove someone",
  },
};

export type Messages = typeof en;

const az: Messages = {
  notAllowed: (username) =>
    username
      ? `Bağışla, bu bot şəxsidir. Səni əlavə etməsi üçün qrup adminə istifadəçi adını göndər: @${username}`
      : "Bağışla, bu bot şəxsidir. Əvvəlcə Telegram tənzimləmələrində istifadəçi adı təyin et, sonra qrup adminindən səni əlavə etməsini xahiş et.",
  welcome: (name) =>
    `Salam, ${name}! 👋\n\nHər gün sənə düşüncələrini yazmağı xatırladacağam. Aşağıdan sənə uyğun saatı və günləri seç. İstənilən vaxt /settings ilə dəyişə bilərsən.`,
  mentorWelcome: (name) => `Salam, ${name}! 👋 Hər şey hazırdır.`,
  mentorIntro:
    "Bot belə işləyir:\n\n• Hər menti öz seçdiyi saatda 5–10 dəqiqə ayırıb qeydlərini yazmaq üçün gündəlik xatırlatma alır. Yazdıqdan sonra ✅ Yazdım düyməsinə basır.\n• Gün saat 04:00-a qədər davam edir, yəni gecə yarısından sonra yazılan qeydlər də sayılır.\n• Admin aktiv etdikdə, hər səhər saat 10:00-da burada ötən gün haqqında qısa hesabat alacaqsınız.\n\nSizin heç nə tənzimləməyinizə ehtiyac yoxdur. Bunu yenidən görmək üçün istənilən vaxt /help göndərin.",
  mentorNoSettings:
    "Xatırlatmalar yalnız mentilər üçündür, burada tənzimləməli bir şey yoxdur. Necə işlədiyini görmək üçün /help göndərin.",
  unmuteTip:
    "🔔 Vacib: bu söhbət səssizdirsə, səsini aç (yuxarıda ⋮ və ya botun adına toxun → Səsi aç), ki, Telegram bağlı olanda da mesajlarım sənə çatsın.",
  mentorUnmuteTip:
    "🔔 Vacib: bu söhbət səssizdirsə, səsini açın (yuxarıda ⋮ və ya botun adına toxunun → Səsi aç), ki, Telegram bağlı olanda da mesajlarım sizə çatsın.",
  help: "📝 Hər gün sənə qeydlərini yazmağı xatırladıram.\n\n/settings: xatırlatma saatı, günləri və mətni\n/done: bu günü yazılmış kimi qeyd et\n/pause: xatırlatmaları dayandır\n/resume: xatırlatmaları bərpa et\n\nGün saat 04:00-a qədər davam edir, yəni gecə yarısından sonra yazsan da sayılır.",
  unknown: "Xatırlatmaları dəyişmək üçün /settings, nə edə bildiyimi görmək üçün /help yaz.",

  defaultReminder: "📝 Bugünkü qeydlərinin vaxtıdır! 5–10 dəqiqə ayırıb ağlından keçənləri yaz.",
  nudge: "🌙 Bugünkü qeydlərini unutma. Saat 04:00-a qədər vaxtın var.",
  btnDone: "✅ Yazdım",
  btnSnooze: (minutes) => (minutes === 60 ? "⏰ 1 saat" : `⏰ ${minutes} dəq`),
  doneAt: (time) => `✅ Yazıldı (${time}). Əla!`,
  markedDone: "✅ Bu gün yazılmış kimi qeyd olundu. Əla!",
  alreadyDone: "Artıq yazılmış kimi qeyd olunub ✅",
  dayOver: "O gün artıq bitib.",
  snoozedUntil: (time) => `⏰ Yaxşı, yenə xatırladacağam (${time}).`,
  snoozeTooLate: "Təxirə salmaq üçün artıq gecdir: gün saat 04:00-da bitir.",

  settingsTitle: "⚙️ Tənzimləmələrin",
  settingTime: "⏰ Saat",
  settingDays: "📅 Günlər",
  settingMessage: "💬 Mətn",
  settingStatus: "Vəziyyət",
  everyDay: "hər gün",
  noDays: "heç biri",
  active: "▶️ aktiv",
  pausedStatus: "⏸ dayandırılıb",
  weekdays: ["1", "2", "3", "4", "5", "6", "7"],
  btnTime: "⏰ Saat",
  btnDays: "📅 Günlər",
  btnMessage: "💬 Mətn",
  btnPause: "⏸ Dayandır",
  btnResume: "▶️ Davam et",
  btnBack: "« Geri",
  btnResetMessage: "↩️ Standart mətn",
  pickHour: "Saatı seç:",
  pickMinute: (hour) => `Dəqiqəni seç (${hour}:__):`,
  pickDays: "Xatırlatmanı açmaq və ya bağlamaq üçün günə toxun (1 = bazar ertəsi, 7 = bazar):",
  messagePrompt:
    "Xatırlatma kimi almaq istədiyin mətni göndər (500 simvola qədər).\n\nİndikini saxlamaq üçün /cancel göndər.",
  messageSaved: "💬 Xatırlatma mətnin yadda saxlanıldı.",
  messageReset: "💬 Standart mətnə qayıdıldı.",
  messageTooLong: "Çox uzundur. Zəhmət olmasa 500 simvoldan qısa yaz.",
  cancelled: "Yaxşı, heç nə dəyişmədi.",
  paused: "⏸ Xatırlatmalar dayandırıldı. Qayıdanda /resume göndər.",
  resumed: "▶️ Xatırlatmalar yenidən aktivdir.",

  adminTitle: "🛠 Admin",
  adminLanguage: "Botun dili",
  adminDigest: "Mentora hesabat",
  adminMentor: "Mentor",
  adminMentees: "Mentilər",
  notSet: "təyin olunmayıb",
  digestModes: { off: "Söndürülüb", count: "Yalnız say", names: "Adlarla" },
  adminHelp:
    "/allow @user …: menti əlavə et\n/mentor @user: mentoru təyin et\n/remove @user: kimisə sil\n/members: hamının siyahısı",
  usageAllow: "İstifadə: /allow @username [@username …]",
  usageMentor: "İstifadə: /mentor @username",
  usageRemove: "İstifadə: /remove @username",
  allowed: (names) => `✅ Əlavə olundu: ${names.join(", ")}\nİndi botu açıb Start düyməsini basa bilərlər.`,
  mentorSet: (name) => `✅ ${name} indi mentordur. Bir dəfə botu açıb Start düyməsini basmalıdır.`,
  removed: (name) => `🗑 ${name} silindi.`,
  notFound: (name) => `${name} siyahıda yoxdur.`,
  membersTitle: "👥 Üzvlər",
  mentorTag: "mentor",
  notStarted: "hələ Start basmayıb",
  noMembers: "Hələ heç kim yoxdur. Mentiləri /allow @username ilə əlavə et.",

  digestTitle: (date) => `📊 ${date} tarixli qeydlər`,
  digestCount: (done, total) => `✍️ ${total} nəfərdən ${done} nəfər qeydlərini yazıb.`,
  digestOffCount: (count) => `💤 ${count} nəfərin istirahət günü idi.`,
  digestDone: "✅ Yazıb",
  digestMissed: "⏳ Yazmayıb",
  digestOff: "💤 İstirahət günü",

  commands: {
    start: "Botu başlat",
    settings: "Xatırlatma tənzimləmələri",
    done: "Bu günü yazılmış kimi qeyd et",
    pause: "Xatırlatmaları dayandır",
    resume: "Xatırlatmaları bərpa et",
    help: "Necə işləyir",
    admin: "Admin paneli",
    members: "Üzvlərin siyahısı",
    allow: "Menti əlavə et",
    mentor: "Mentoru təyin et",
    remove: "Kimisə sil",
  },
};

export const messages: Record<Lang, Messages> = { az, en };

export function isLang(value: string | undefined): value is Lang {
  return value === "az" || value === "en";
}
