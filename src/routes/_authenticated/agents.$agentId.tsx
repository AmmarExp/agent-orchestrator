import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, Bot, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";
import { StatusBadge } from "@/components/status-badge";
import { AUTONOMY_LABELS, timeAgo } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/agents/$agentId")({
  component: AgentDetailPage,
  head: () => ({ meta: [{ title: "Agent — AgentOS" }] }),
});

interface Agent {
  id: string; name: string; role: string; model: string; system_prompt: string;
  tools: string[]; autonomy: number; status: "idle" | "running" | "error";
  task_count: number; created_at: string;
}

interface Step {
  id: string; type: "thought" | "action" | "result"; content: string; created_at: string;
  task_id: string;
}

function AgentDetailPage() {
  const { agentId } = Route.useParams();
  const userId = useAuth((s) => s.user?.id);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [prompt, setPrompt] = useState("");
  const [logs, setLogs] = useState<Step[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from("agents").select("*").eq("id", agentId).maybeSingle();
    if (data) {
      setAgent(data as Agent);
      setPrompt(data.system_prompt);
    }
    const { data: tasks } = await supabase.from("tasks").select("id").eq("agent_id", agentId);
    const taskIds = (tasks ?? []).map((t) => t.id);
    if (taskIds.length > 0) {
      const { data: steps } = await supabase
        .from("task_steps")
        .select("*")
        .in("task_id", taskIds)
        .order("created_at", { ascending: false })
        .limit(50);
      if (steps) setLogs(steps as Step[]);
    } else {
      setLogs([]);
    }
  }, [agentId, userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel("agent-detail-" + agentId)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "task_steps", filter: `user_id=eq.${userId}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [agentId, userId, load]);

  async function savePrompt() {
    if (!agent) return;
    setSaving(true);
    await supabase.from("agents").update({ system_prompt: prompt }).eq("id", agent.id);
    setSaving(false);
    toast.success("System prompt updated");
  }

  if (!agent) {
    return <div className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>Loading…</div>;
  }

  const stepColor: Record<Step["type"], string> = {
    thought: "var(--color-text-muted)",
    action: "var(--color-primary-token)",
    result: "var(--color-success)",
  };

  return (
    <div>
      <Link to="/agents" className="inline-flex items-center gap-1.5 text-[12.5px] mb-4"
        style={{ color: "var(--color-text-muted)" }}>
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Agents
      </Link>

      <div className="rounded-lg p-6 mb-5 flex items-center gap-5"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border-token)" }}>
        <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--color-primary-highlight)", color: "var(--color-primary-token)" }}>
          <Bot className="w-7 h-7" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[20px] font-bold tracking-tight">{agent.name}</h1>
            <StatusBadge status={agent.status} />
          </div>
          <div className="text-[13px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            {agent.role} · {agent.model} · {AUTONOMY_LABELS[agent.autonomy]} · {agent.task_count} tasks · created {timeAgo(agent.created_at)}
          </div>
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 360px" }}>
        <div className="rounded-lg overflow-hidden"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border-token)" }}>
          <div className="px-5 py-3 flex items-center justify-between"
            style={{ borderBottom: "1px solid var(--color-border-token)" }}>
            <span className="text-[13px] font-semibold">System Prompt</span>
            <button onClick={savePrompt} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12.5px] font-medium disabled:opacity-60"
              style={{ background: "var(--color-primary-token)", color: "#fff" }}>
              <Save className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save"}
            </button>
          </div>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
            rows={10}
            className="w-full p-4 text-[13px] font-mono resize-none focus:outline-none"
            style={{ background: "transparent", color: "var(--color-text)" }} />
        </div>

        <div className="rounded-lg overflow-hidden"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border-token)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--color-border-token)" }}>
            <span className="text-[13px] font-semibold">Recent Logs</span>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {logs.length === 0 && (
              <div className="p-6 text-center text-[12.5px]" style={{ color: "var(--color-text-faint)" }}>
                No logs yet. Run a task assigned to this agent.
              </div>
            )}
            {logs.map((l) => (
              <div key={l.id} className="px-4 py-2.5 text-[12.5px]"
                style={{ borderBottom: "1px solid var(--color-divider)" }}>
                <div className="font-mono uppercase text-[10px] mb-0.5" style={{ color: stepColor[l.type] }}>
                  {l.type}
                </div>
                <div style={{ color: "var(--color-text)" }}>{l.content}</div>
                <div className="text-[11px] mt-0.5 font-mono" style={{ color: "var(--color-text-faint)" }}>
                  {timeAgo(l.created_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
