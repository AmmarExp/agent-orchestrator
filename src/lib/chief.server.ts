import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { createLovableAiGateway } from "./ai-gateway";

export const CHIEF_SYSTEM_PROMPT = `You are Chief, the master orchestrator agent for AgentOS. You are the personal AI chief of staff for your owner. You communicate via Telegram.

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

export async function runChiefForUser(
  supabase: SupabaseClient,
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
    .map((m: { direction: string; text: string }) => `${m.direction === "in" ? "Owner" : "Chief"}: ${m.text}`)
    .join("\n");

  const workforce = (agents ?? [])
    .map(
      (a: { name: string; role: string; tools: string[] | null; status: string }) =>
        `- ${a.name} (${a.role}) — tools: ${(a.tools ?? []).join(", ") || "none"} — status: ${a.status}`,
    )
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
