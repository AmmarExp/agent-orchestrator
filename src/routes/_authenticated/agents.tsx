import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Plus, Bot, MoreHorizontal, Trash2, Copy, Pause, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";
import { StatusBadge } from "@/components/status-badge";
import { NewAgentModal } from "@/components/new-agent-modal";
import { AUTONOMY_LABELS, timeAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/agents")({
  component: AgentsPage,
  head: () => ({ meta: [{ title: "Agents — AgentOS" }] }),
});

interface Agent {
  id: string; name: string; role: string; model: string; system_prompt: string;
  tools: string[]; autonomy: number; status: "idle" | "running" | "error";
  task_count: number; created_at: string;
}

function AgentsPage() {
  const userId = useAuth((s) => s.user?.id);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("agents")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setAgents(data as Agent[]);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel("agents-" + userId)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "agents", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, load]);

  async function deleteAgent(id: string, name: string) {
    if (!userId) return;
    if (!confirm(`Delete agent "${name}"? This will remove its tasks.`)) return;
    await supabase.from("agents").delete().eq("id", id);
    await supabase.from("feed_events").insert({
      user_id: userId, kind: "agent_deleted", message: `Deleted agent "${name}"`,
    });
  }

  async function clone(a: Agent) {
    if (!userId) return;
    await supabase.from("agents").insert({
      user_id: userId, name: a.name + " (copy)", role: a.role, model: a.model,
      system_prompt: a.system_prompt, tools: a.tools, autonomy: a.autonomy,
    });
  }

  async function toggle(a: Agent) {
    const next = a.status === "running" ? "idle" : "running";
    await supabase.from("agents").update({ status: next }).eq("id", a.id);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ letterSpacing: "-0.02em" }}>Agents</h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            Your AI workforce.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-md text-[13px] font-medium"
          style={{ background: "var(--color-primary-token)", color: "#fff" }}
        >
          <Plus className="w-4 h-4" /> New Agent
        </button>
      </div>

      {agents.length === 0 ? (
        <div className="rounded-lg p-12 text-center"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border-token)" }}>
          <Bot className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--color-text-faint)" }} />
          <div className="text-[14px] font-semibold mb-1">No agents yet</div>
          <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            Create your first agent to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {agents.map((a) => (
            <div key={a.id} className="rounded-lg p-5 transition-shadow hover:shadow-md"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border-token)" }}>
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--color-primary-highlight)", color: "var(--color-primary-token)" }}>
                  <Bot className="w-5 h-5" />
                </div>
                <Link to="/agents/$agentId" params={{ agentId: a.id }} className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold truncate">{a.name}</div>
                  <div className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                    {a.role} · {a.model.split("/").pop()}
                  </div>
                </Link>
                <StatusBadge status={a.status} />
              </div>

              <p className="text-[12.5px] mb-3 line-clamp-2" style={{ color: "var(--color-text-muted)", lineHeight: 1.5 }}>
                {a.system_prompt || "No system prompt set."}
              </p>

              <div className="flex flex-wrap items-center gap-1.5 mb-3">
                <Chip>{AUTONOMY_LABELS[a.autonomy]}</Chip>
                {a.tools.slice(0, 3).map((t) => <Chip key={t}>{t}</Chip>)}
                {a.tools.length > 3 && <Chip>+{a.tools.length - 3}</Chip>}
              </div>

              <div className="flex items-center justify-between pt-3"
                style={{ borderTop: "1px solid var(--color-divider)" }}>
                <div className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                  <strong style={{ color: "var(--color-text)" }}>{a.task_count}</strong> tasks · {timeAgo(a.created_at)}
                </div>
                <div className="flex gap-1">
                  <IconBtn onClick={() => toggle(a)} title={a.status === "running" ? "Pause" : "Run"}>
                    {a.status === "running" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </IconBtn>
                  <IconBtn onClick={() => clone(a)} title="Clone"><Copy className="w-3.5 h-3.5" /></IconBtn>
                  <IconBtn onClick={() => deleteAgent(a.id, a.name)} title="Delete"><Trash2 className="w-3.5 h-3.5" /></IconBtn>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <NewAgentModal open={open} onClose={() => setOpen(false)} onCreated={load} />
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 rounded text-[11px] font-mono"
      style={{ background: "var(--color-surface-offset)", color: "var(--color-text-muted)" }}>
      {children}
    </span>
  );
}

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick} title={title}
      className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--color-surface-offset)]"
      style={{ color: "var(--color-text-muted)" }}
    >
      {children}
    </button>
  );
}
