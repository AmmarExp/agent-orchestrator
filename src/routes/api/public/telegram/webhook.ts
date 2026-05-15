import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTelegramMessage } from "@/lib/telegram.server";
import { runChiefForUser } from "@/lib/chief.server";

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const tg = process.env.TELEGRAM_API_KEY?.trim();
        if (!tg) return new Response("Telegram not configured", { status: 500 });

        let update: {
          update_id?: number;
          message?: {
            message_id?: number;
            chat?: { id?: number };
            from?: { id?: number; first_name?: string };
            text?: string;
          };
          edited_message?: unknown;
        };

        try {
          update = await request.json();
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        const msg = update.message;
        const chatId = msg?.chat?.id;
        const text = (msg?.text ?? "").trim();
        if (!chatId || !text) return Response.json({ ok: true, ignored: true });

        try {
          // /link CODE or /start CODE — bind chat_id to the profile that owns CODE
          const linkMatch = text.match(/^\/(?:start|link)\s+([A-Z0-9]{4,12})$/i);
          if (linkMatch) {
            const code = linkMatch[1].toUpperCase();
            const { data: profile } = await supabaseAdmin
              .from("profiles")
              .select("id, telegram_link_code_expires_at")
              .eq("telegram_link_code", code)
              .maybeSingle();
            if (!profile) {
              await sendTelegramMessage(chatId, "❌ Invalid link code. Generate a new one in AgentOS → Chief.");
              return Response.json({ ok: true });
            }
            const expiresAt = profile.telegram_link_code_expires_at
              ? new Date(profile.telegram_link_code_expires_at)
              : null;
            if (!expiresAt || expiresAt < new Date()) {
              // Clear the stale code
              await supabaseAdmin
                .from("profiles")
                .update({ telegram_link_code: null, telegram_link_code_expires_at: null })
                .eq("id", profile.id);
              await sendTelegramMessage(chatId, "⏰ This link code has expired. Please generate a new one in AgentOS → Chief.");
              return Response.json({ ok: true });
            }
            await supabaseAdmin
              .from("profiles")
              .update({ telegram_chat_id: chatId, telegram_link_code: null, telegram_link_code_expires_at: null })
              .eq("id", profile.id);
            await sendTelegramMessage(chatId, "✅ Linked! I'm Chief — your AI chief of staff. Send me anything in Arabic or English.");
            return Response.json({ ok: true });
          }

          // Find owning user by chat_id
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("telegram_chat_id", chatId)
            .maybeSingle();

          if (!profile) {
            await sendTelegramMessage(
              chatId,
              "👋 I'm Chief from AgentOS. To link this chat, open AgentOS → Chief, generate a code, then send:\n<code>/link YOURCODE</code>",
            );
            return Response.json({ ok: true });
          }

          await supabaseAdmin.from("chief_messages").insert({
            user_id: profile.id,
            direction: "in",
            text,
            telegram_message_id: msg?.message_id ?? null,
          });

          const reply = await runChiefForUser(supabaseAdmin, profile.id, text);
          await sendTelegramMessage(chatId, reply);
          await supabaseAdmin.from("chief_messages").insert({
            user_id: profile.id,
            direction: "out",
            text: reply,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          console.error("[telegram webhook]", message);
          try {
            await sendTelegramMessage(chatId, `⚠️ Chief hit an error: ${message}`);
          } catch {
            /* ignore */
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
