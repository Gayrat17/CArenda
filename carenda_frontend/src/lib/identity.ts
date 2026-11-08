import { User } from "@/types/fleet";

export interface ResolvedIdentity {
  fullName: string;
  username: string | null;
  telegramId: number | null;
  phone: string | null;
}

export function resolveUserIdentity(user: User | null): ResolvedIdentity {
  let tgFallbackUser: {
    id?: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  } | null = null;

  if (typeof window !== "undefined" && window.Telegram?.WebApp?.initDataUnsafe?.user) {
    tgFallbackUser = window.Telegram.WebApp.initDataUnsafe.user;
  }

  const tgFullName = `${tgFallbackUser?.first_name || ""} ${tgFallbackUser?.last_name || ""}`.trim();

  const fullName =
    user?.full_name?.trim() ||
    tgFullName ||
    (user?.username && !user.username.startsWith("tg_") ? user.username : null) ||
    tgFallbackUser?.username ||
    "Foydalanuvchi";

  const rawUsername =
    (user?.username && !user.username.startsWith("tg_") ? user.username : null) ||
    tgFallbackUser?.username ||
    null;

  const username = rawUsername ? rawUsername.replace(/^@/, "") : null;
  const telegramId = user?.telegram_id ?? tgFallbackUser?.id ?? null;
  const phone = user?.phone?.trim() || null;

  return {
    fullName,
    username,
    telegramId,
    phone,
  };
}
