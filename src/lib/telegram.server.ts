import { createHash } from "crypto";

const TG_BASE = "https://api.telegram.org/bot";

export function getTelegramCreds() {
  const tg = process.env.TELEGRAM_API_KEY;
  if (!tg) return null;
  return { tg };
}

export function deriveTelegramWebhookSecret(tgApiKey: string) {
  return createHash("sha256").update("telegram-webhook:" + tgApiKey).digest("base64url");
}

export async function tgCall<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const c = getTelegramCreds();
  if (!c) throw new Error("Telegram is not connected.");
  const r = await fetch(`${TG_BASE}${c.tg}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Telegram ${method} failed [${r.status}]: ${text}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export async function sendTelegramMessage(chatId: number | string, text: string) {
  return tgCall("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
}
