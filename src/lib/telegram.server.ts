import { createHash } from "crypto";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

export function getTelegramCreds() {
  const tg = process.env.TELEGRAM_API_KEY?.trim();
  const lovable = process.env.LOVABLE_API_KEY?.trim();
  if (!tg || !lovable) return null;
  return { tg, lovable };
}

export function deriveTelegramWebhookSecret(tgApiKey: string) {
  return createHash("sha256").update("telegram-webhook:" + tgApiKey.trim()).digest("base64url");
}

export async function tgCall<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const c = getTelegramCreds();
  if (!c) throw new Error("Telegram is not connected (missing TELEGRAM_API_KEY or LOVABLE_API_KEY).");
  const r = await fetch(`${GATEWAY_URL}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.lovable}`,
      "X-Connection-Api-Key": c.tg,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Telegram ${method} failed [${r.status}]: ${text || r.statusText}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export async function sendTelegramMessage(chatId: number | string, text: string) {
  return tgCall("sendMessage", { chat_id: chatId, text });
}
