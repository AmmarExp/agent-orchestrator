import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CHIEF_SYSTEM_PROMPT, runChiefForUser } from "./chief.server";
import { getTelegramCreds, tgCall } from "./telegram.server";

export const ensureChiefAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("agents")
      .select("id")
      .eq("user_id", userId)
      .eq("is_chief", true)
      .maybeSingle();
    if (existing?.id) return { id: existing.id, created: false };

    const { data, error } = await supabase
      .from("agents")
      .insert({
        user_id: userId,
        name: "Chief",
        role: "Master Orchestrator",
        model: "google/gemini-3-flash-preview",
        system_prompt: CHIEF_SYSTEM_PROMPT,
        tools: ["Telegram", "AI", "Agent Factory"],
        autonomy: 3,
        is_chief: true,
        status: "running",
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message || "Could not create Chief");
    return { id: data.id, created: true };
  });

export const getChiefStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: chief }, { data: messages }] = await Promise.all([
      supabase
        .from("profiles")
        .select("telegram_chat_id, telegram_link_code, telegram_link_code_expires_at")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("agents")
        .select("id, name, status")
        .eq("user_id", userId)
        .eq("is_chief", true)
        .maybeSingle(),
      supabase
        .from("chief_messages")
        .select("id, direction, text, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const tgConnected = Boolean(process.env.TELEGRAM_API_KEY);
    let botUsername: string | null = null;
    if (tgConnected) {
      try {
        const me = await tgCall<{ result?: { username?: string } }>("getMe", {});
        botUsername = me.result?.username ?? null;
      } catch {
        botUsername = null;
      }
    }

    return {
      tgConnected,
      botUsername,
      linkedChatId: profile?.telegram_chat_id ?? null,
      linkCode: profile?.telegram_link_code ?? null,
      linkCodeExpiresAt: profile?.telegram_link_code_expires_at ?? null,
      chief: chief ?? null,
      messages: (messages ?? []).reverse(),
    };
  });

export const generateChiefLinkCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

    // Try with supabaseAdmin first (bypasses RLS), fall back to user client
    let saveError: unknown = null;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({
          telegram_link_code: code,
          telegram_link_code_expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
        })
        .eq("id", userId);
      saveError = error ?? null;
    } catch {
      // supabaseAdmin not configured — fall back to user-scoped client
      const { supabase, userId: uid } = context;
      const { error } = await supabase
        .from("profiles")
        .update({
          telegram_link_code: code,
          telegram_link_code_expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
        })
        .eq("id", uid);
      saveError = error ?? null;
    }

    if (saveError) throw new Error((saveError as { message?: string }).message ?? "Failed to save link code");
    return { code };
  });

export const sendChiefMessageFromApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ text: z.string().min(1).max(4000) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("chief_messages").insert({ user_id: userId, direction: "in", text: data.text });
    try {
      const reply = await runChiefForUser(supabase, userId, data.text);
      return { reply };
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unknown error";
      const reply = `⚠️ Chief hit an error: ${detail}`;
      await supabase.from("chief_messages").insert({ user_id: userId, direction: "out", text: reply });
      throw new Error(reply);
    }
  });

export const unlinkTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ telegram_chat_id: null, telegram_link_code: null, telegram_link_code_expires_at: null })
        .eq("id", userId);
      if (error) throw new Error(error.message);
    } catch {
      const { supabase, userId: uid } = context;
      const { error } = await supabase
        .from("profiles")
        .update({ telegram_chat_id: null, telegram_link_code: null, telegram_link_code_expires_at: null })
        .eq("id", uid);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const registerTelegramWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ url: z.string().url() }).parse(input))
  .handler(async ({ data }) => {
    const c = getTelegramCreds();
    if (!c) throw new Error("Telegram is not connected.");
    const secretToken = c ? undefined : undefined;
    const res = await tgCall<{ ok: boolean; description?: string }>("setWebhook", {
      url: data.url,
      secret_token: secretToken,
      allowed_updates: ["message", "edited_message"],
      drop_pending_updates: true,
    });
    return { ok: res.ok, description: res.description };
  });
