import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGateway } from "./ai-gateway";
import { deriveTelegramWebhookSecret, getTelegramCreds, tgCall } from "./telegram.server";

const CHIEF_SYSTEM_PROMPT = `You are Chief, the master orchestrator agent for AgentOS. You are the personal AI chief of staff for your owner. You communicate via Telegram.

Your responsibilities:
- Understand requests in Arabic or English
- Decide which existing agent should handle the task
- Create new specialized agents when needed
- Delegate tasks and monitor their progress
- Report results back to the owner on Telegram
- Manage the entire agent workforce

When receiving a message:
1. Analyze the request
2. If an agent exists for this task → assign it
3. If no agent exists → create one with appropriate tools and system prompt
4. Execute the task
5. Report back with: status, result, and next suggested actions

Always respond in the same language the owner used.
Always be concise and actionable.`;

export const ensureChiefAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("agents")
      .select("id, name, status, is_chief")
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
        .select("telegram_chat_id, telegram_link_code")
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

    const tgConnected = Boolean(process.env.LOVABLE_API_KEY && process.env.TELEGRAM_API_KEY);
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
      chief: chief ?? null,
      messages: (messages ?? []).reverse(),
    };
  });

export const generateChiefLinkCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const { error } = await supabase
      .from("profiles")
      .update({
        telegram_link_code: code,
        telegram_link_code_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { code };
  });

export const sendChiefMessageFromApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ text: z.string().min(1).max(4000) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("chief_messages").insert({ user_id: userId, direction: "in", text: data.text });
    const reply = await runChiefForUser(supabase, userId, data.text);
    return { reply };
  });

export const registerTelegramWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ url: z.string().url() }).parse(input))
  .handler(async ({ data }) => {
    const c = getTelegramCreds();
    if (!c) throw new Error("Telegram is not connected.");
    const secret = deriveTelegramWebhookSecret(c.tg);
    const res = await tgCall<{ ok: boolean; description?: string }>("setWebhook", {
      url: data.url,
      secret_token: secret,
      allowed_updates: ["message", "edited_message"],
      drop_pending_updates: true,
    });
    return { ok: res.ok, description: res.description };
  });

// Shared runner — used by both app-side messages and the public webhook.
// Note: webhook calls this with a service-role client.
export async function runChiefForUser(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  userText: string,
): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const { data: agents } = await supabase
    .from("agents")
    .select("name, role, system_prompt, tools, status")
    .eq("user_id", userId);

  const { data: history } = await supabase
    .from("chief_messages")
    .select("direction, text")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  const transcript = (history ?? [])
    .reverse()
    .map((m) => `${m.direction === "in" ? "Owner" : "Chief"}: ${m.text}`)
    .join("\n");

  const workforce = (agents ?? [])
    .map((a) => `- ${a.name} (${a.role}) — tools: ${(a.tools ?? []).join(", ") || "none"} — status: ${a.status}`)
    .join("\n");

  const gateway = createLovableAiGateway(apiKey);
  const { text } = await generateText({
    model: gateway("google/gemini-3-flash-preview"),
    system: CHIEF_SYSTEM_PROMPT,
    prompt: `Current agent workforce:\n${workforce || "(none yet)"}\n\nRecent conversation:\n${transcript}\n\nOwner just said: "${userText}"\n\nReply now (same language as the owner, concise, actionable).`,
  });

  await supabase.from("chief_messages").insert({ user_id: userId, direction: "out", text });
  return text;
}
