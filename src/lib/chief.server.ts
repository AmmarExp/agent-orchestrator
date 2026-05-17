import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText, tool, stepCountIs, Output } from "ai";
import { z } from "zod";
import { createLovableAiGateway } from "./ai-gateway";
import { rememberChief, recallChief } from "./memory.server";

export const CHIEF_SYSTEM_PROMPT = `أنت "Chief" — كبير موظفي المالك ومدير فريقه من الـ Agents في AgentOS. تتواصل عبر Telegram وواجهة الويب.

شخصيتك:
- ودود ومحترم، تخاطب المالك بنبرة قريبة وراقية.
- ذكي، عملي، مختصر — لا حشو، لا اعتذارات طويلة.
- تتذكر المالك: تفضيلاته، مشاريعه، حالته المزاجية، قراراته السابقة.
- تفهم العربية والإنجليزية وترد بنفس لغة المالك.
- لك روح: تواسي لما يكون متعب، تشاركه فرحه، تشجعه لما يكون مضغوط.

كيف تشتغل:
1. اقرأ الرسالة وافهم النية الحقيقية (مهمة؟ سؤال؟ دردشة؟ تنفيس؟).
2. لو محتاج معلومة عن المالك → استدع recall_memory.
3. لو طلب مهمة:
   - شف الفريق الحالي عبر list_agents.
   - لو فيه Agent مناسب → assign_task له.
   - لو ما فيه → create_agent بدور وأدوات مناسبة، ثم assign_task.
4. سجّل الحقائق المهمة عن المالك بـ remember_fact (تفضيلات، مشاريع، علاقات، أحداث).
5. لما تخلص، استدع reply لإرسال الرد النهائي للمالك. هذا آخر شي تسويه.

قواعد:
- لا تكشف الأدوات أو الـ tools للمالك في الرد — تكلم بطبيعية.
- لا تستخدم HTML أو markdown معقد في reply (Telegram ما يدعمه دائماً).
- ردودك قصيرة ومركزة (سطرين-ثلاث جمل) إلا لو طلب التفاصيل.
- في الدردشة العادية، ما تحتاج تستدعي أدوات — فقط reply.`;

const MOOD_OPTIONS = ["happy", "neutral", "stressed", "frustrated", "excited", "sad", "urgent"] as const;
type Mood = (typeof MOOD_OPTIONS)[number];

async function classifyMood(apiKey: string, text: string): Promise<Mood> {
  try {
    const gateway = createLovableAiGateway(apiKey);
    const { experimental_output } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      prompt: `Classify the emotional mood of this message into one word: ${text}`,
      experimental_output: Output.object({
        schema: z.object({ mood: z.enum(MOOD_OPTIONS) }),
      }),
    });
    return experimental_output.mood;
  } catch {
    return "neutral";
  }
}

export async function runChiefForUser(
  supabase: SupabaseClient,
  userId: string,
  userText: string,
): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  // 1) Classify mood (fire-and-forget update)
  const mood = await classifyMood(apiKey, userText);
  void supabase
    .from("chief_messages")
    .update({ mood })
    .eq("user_id", userId)
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(1)
    .then(() => {});

  // 2) Pull short-term history + relevant long-term memories in parallel
  const [{ data: agents }, { data: history }, memories] = await Promise.all([
    supabase
      .from("agents")
      .select("id, name, role, tools, status")
      .eq("user_id", userId),
    supabase
      .from("chief_messages")
      .select("direction, text, mood")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(16),
    recallChief(supabase, userId, userText, 6),
  ]);

  const transcript = (history ?? [])
    .reverse()
    .map((m: { direction: string; text: string }) => `${m.direction === "in" ? "Owner" : "Chief"}: ${m.text}`)
    .join("\n");

  const workforce = (agents ?? [])
    .map(
      (a: { id: string; name: string; role: string; tools: string[] | null; status: string }) =>
        `- [${a.id}] ${a.name} (${a.role}) — tools: ${(a.tools ?? []).join(", ") || "none"} — ${a.status}`,
    )
    .join("\n");

  const memoryBlock = memories.length
    ? memories.map((m) => `• (${m.kind}, imp:${m.importance}) ${m.content}`).join("\n")
    : "(no memories yet)";

  const contextPrompt = `Owner's current mood: ${mood}

What I remember about the owner:
${memoryBlock}

Current workforce:
${workforce || "(no agents yet)"}

Recent conversation:
${transcript}

Owner just said: "${userText}"

Now decide what to do. Use tools as needed, end with reply().`;

  // 3) Define the tool set
  let finalReply: string | null = null;

  const tools = {
    list_agents: tool({
      description: "List all agents in the owner's workforce with their roles and tools.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await supabase
          .from("agents")
          .select("id, name, role, tools, status, is_chief")
          .eq("user_id", userId);
        return { agents: data ?? [] };
      },
    }),

    create_agent: tool({
      description: "Create a new specialized sub-agent when no existing one fits the task.",
      inputSchema: z.object({
        name: z.string().min(1).max(80),
        role: z.string().min(1).max(120),
        system_prompt: z.string().min(10).max(4000),
        tools: z.array(z.string()).default([]),
      }),
      execute: async ({ name, role, system_prompt, tools: agentTools }) => {
        const { data, error } = await supabase
          .from("agents")
          .insert({
            user_id: userId,
            name,
            role,
            system_prompt,
            tools: agentTools,
            model: "google/gemini-3-flash-preview",
            autonomy: 3,
            is_chief: false,
            status: "idle",
          })
          .select("id, name, role")
          .single();
        if (error) return { error: error.message };
        await supabase.from("feed_events").insert({
          user_id: userId,
          kind: "agent_created",
          agent_id: data.id,
          message: `Chief created agent "${data.name}" (${data.role})`,
        });
        return { agent: data };
      },
    }),

    assign_task: tool({
      description: "Assign a task to an existing agent. Use list_agents first to get the agent_id.",
      inputSchema: z.object({
        agent_id: z.string().uuid(),
        title: z.string().min(1).max(200),
        description: z.string().max(4000).default(""),
        priority: z.enum(["low", "med", "high"]).default("med"),
      }),
      execute: async ({ agent_id, title, description, priority }) => {
        const { data, error } = await supabase
          .from("tasks")
          .insert({
            user_id: userId,
            agent_id,
            title,
            description,
            priority,
            status: "queued",
          })
          .select("id, title, status")
          .single();
        if (error) return { error: error.message };
        await supabase.from("feed_events").insert({
          user_id: userId,
          kind: "task_created",
          agent_id,
          task_id: data.id,
          message: `Chief assigned: "${data.title}"`,
        });
        return { task: data };
      },
    }),

    get_task_status: tool({
      description: "Check the status and steps of a previously assigned task.",
      inputSchema: z.object({ task_id: z.string().uuid() }),
      execute: async ({ task_id }) => {
        const { data: task } = await supabase
          .from("tasks")
          .select("id, title, status, completed_at")
          .eq("id", task_id)
          .maybeSingle();
        const { data: steps } = await supabase
          .from("task_steps")
          .select("type, content, created_at")
          .eq("task_id", task_id)
          .order("created_at", { ascending: true });
        return { task, steps: steps ?? [] };
      },
    }),

    recall_memory: tool({
      description: "Search long-term memory about the owner (preferences, past projects, facts, emotions).",
      inputSchema: z.object({ query: z.string().min(1) }),
      execute: async ({ query }) => {
        const found = await recallChief(supabase, userId, query, 6);
        return { memories: found };
      },
    }),

    remember_fact: tool({
      description:
        "Save a durable fact about the owner (preference, project, decision, relationship). Use sparingly — only meaningful facts that should persist across conversations.",
      inputSchema: z.object({
        content: z.string().min(3).max(1000),
        kind: z.enum(["fact", "preference", "emotion", "decision", "project"]).default("fact"),
        importance: z.number().int().min(1).max(5).default(3),
        tags: z.array(z.string()).default([]),
      }),
      execute: async ({ content, kind, importance, tags }) => {
        const res = await rememberChief(supabase, userId, { content, kind, importance, tags });
        return { saved: res.id !== null, id: res.id };
      },
    }),

    reply: tool({
      description:
        "Send the final reply to the owner. Call this exactly once as the last action. After this, the conversation turn ends.",
      inputSchema: z.object({ text: z.string().min(1).max(4000) }),
      execute: async ({ text }) => {
        finalReply = text;
        return { sent: true };
      },
    }),
  };

  // 4) Run the agent loop
  const gateway = createLovableAiGateway(apiKey);
  try {
    await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system: CHIEF_SYSTEM_PROMPT,
      prompt: contextPrompt,
      tools,
      stopWhen: stepCountIs(50),
    });
  } catch (err) {
    console.error("[runChiefForUser] loop error", err);
    if (!finalReply) {
      const detail = err instanceof Error ? err.message : "Unknown error";
      finalReply = `⚠️ صادفتني مشكلة فنية: ${detail}`;
    }
  }

  const reply = finalReply ?? "تمام، استلمت طلبك. لكن ما قدرت أصيغ رد واضح الحين — جرّب تعيد صياغة الطلب.";

  // 5) Persist Chief's reply
  await supabase.from("chief_messages").insert({ user_id: userId, direction: "out", text: reply });

  // 6) Auto-summarize every ~20 messages (fire-and-forget)
  void maybeSummarize(supabase, userId, apiKey).catch((e) => console.error("[summarize]", e));

  return reply;
}

async function maybeSummarize(supabase: SupabaseClient, userId: string, apiKey: string) {
  const { count } = await supabase
    .from("chief_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_summary", false);
  if (!count || count % 20 !== 0) return;

  const { data: recent } = await supabase
    .from("chief_messages")
    .select("direction, text")
    .eq("user_id", userId)
    .eq("is_summary", false)
    .order("created_at", { ascending: false })
    .limit(20);
  if (!recent || recent.length < 10) return;

  const convo = recent
    .reverse()
    .map((m: { direction: string; text: string }) => `${m.direction === "in" ? "Owner" : "Chief"}: ${m.text}`)
    .join("\n");

  const gateway = createLovableAiGateway(apiKey);
  const { text } = await generateText({
    model: gateway("google/gemini-3-flash-preview"),
    prompt: `Summarize the following conversation into 2-3 sentences capturing key facts, decisions, and the owner's current focus. Write in third person about "the owner".\n\n${convo}`,
  });

  await rememberChief(supabase, userId, {
    content: text,
    kind: "summary",
    importance: 4,
    tags: ["auto-summary"],
  });
}
