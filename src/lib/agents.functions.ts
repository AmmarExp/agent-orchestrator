import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGateway } from "./ai-gateway";

export const runAgentTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ taskId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const { data: task, error: taskErr } = await supabase
      .from("tasks")
      .select("*, agents!inner(*)")
      .eq("id", data.taskId)
      .single();
    if (taskErr || !task) throw new Error("Task not found");

    const agent = (task as { agents: { name: string; system_prompt: string; model: string; id: string } }).agents;

    // Mark running
    await supabase.from("tasks").update({ status: "running" }).eq("id", task.id);
    await supabase.from("agents").update({ status: "running" }).eq("id", agent.id);
    await supabase.from("feed_events").insert({
      user_id: userId,
      kind: "task_started",
      agent_id: agent.id,
      task_id: task.id,
      message: `${agent.name} started "${task.title}"`,
    });
    await supabase.from("task_steps").insert({
      task_id: task.id,
      user_id: userId,
      type: "thought",
      content: `Analyzing task: ${task.title}`,
    });

    try {
      const gateway = createLovableAiGateway(apiKey);
      const { text } = await generateText({
        model: gateway(agent.model || "google/gemini-3-flash-preview"),
        system: agent.system_prompt || "You are a helpful AI agent.",
        prompt: `Task: ${task.title}\n\n${task.description || ""}\n\nProduce a concise, actionable response.`,
      });

      await supabase.from("task_steps").insert([
        { task_id: task.id, user_id: userId, type: "action", content: `Calling ${agent.model}` },
        { task_id: task.id, user_id: userId, type: "result", content: text },
      ]);
      await supabase
        .from("tasks")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", task.id);
      await supabase.from("agents").update({ status: "idle" }).eq("id", agent.id);
      await supabase.rpc; // no-op placeholder
      await supabase.from("feed_events").insert({
        user_id: userId,
        kind: "task_completed",
        agent_id: agent.id,
        task_id: task.id,
        message: `${agent.name} completed "${task.title}"`,
      });
      return { ok: true, output: text };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await supabase.from("task_steps").insert({
        task_id: task.id,
        user_id: userId,
        type: "result",
        content: `ERROR: ${message}`,
      });
      await supabase.from("tasks").update({ status: "failed" }).eq("id", task.id);
      await supabase.from("agents").update({ status: "error" }).eq("id", agent.id);
      await supabase.from("feed_events").insert({
        user_id: userId,
        kind: "task_failed",
        agent_id: agent.id,
        task_id: task.id,
        message: `${agent.name} failed "${task.title}": ${message}`,
      });
      throw new Error(message);
    }
  });
