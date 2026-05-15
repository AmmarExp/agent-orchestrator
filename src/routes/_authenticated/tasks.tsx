import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";
import { NewTaskModal } from "@/components/new-task-modal";
import { useServerFn } from "@tanstack/react-start";
import { runAgentTask } from "@/lib/agents.functions";
import { timeAgo } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
  head: () => ({ meta: [{ title: "Tasks — AgentOS" }] }),
});

type TaskStatus = "queued" | "running" | "completed" | "failed";

interface Task {
  id: string; title: string; priority: "low" | "med" | "high"; status: TaskStatus;
  created_at: string; agent_id: string;
  agents: { name: string } | null;
}

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "queued", label: "Queued" },
  { key: "running", label: "Running" },
  { key: "completed", label: "Completed" },
  { key: "failed", label: "Failed" },
];

function TasksPage() {
  const userId = useAuth((s) => s.user?.id);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [open, setOpen] = useState(false);
  const runFn = useServerFn(runAgentTask);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("tasks")
      .select("id, title, priority, status, created_at, agent_id, agents(name)")
      .order("created_at", { ascending: false });
    if (data) setTasks(data as unknown as Task[]);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel("tasks-" + userId)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, load]);

  async function runTask(id: string) {
    try {
      await runFn({ data: { taskId: id } });
      toast.success("Task completed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Task failed");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ letterSpacing: "-0.02em" }}>Tasks</h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            Track every task across your agent pipeline.
          </p>
        </div>
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-md text-[13px] font-medium"
          style={{ background: "var(--color-primary-token)", color: "#fff" }}>
          <Plus className="w-4 h-4" /> New Task
        </button>
      </div>

      <div className="grid gap-3.5"
        style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} className="rounded-lg overflow-hidden flex flex-col"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border-token)", minHeight: 400 }}>
              <div className="flex items-center justify-between px-3.5 py-3"
                style={{ borderBottom: "1px solid var(--color-border-token)" }}>
                <span className="text-[12px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--color-text-muted)" }}>{col.label}</span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                  style={{ background: "var(--color-surface-offset)", color: "var(--color-text-muted)" }}>{items.length}</span>
              </div>
              <div className="p-2.5 flex flex-col gap-2 flex-1">
                {items.map((t) => (
                  <div key={t.id} className="rounded-md p-3 transition-all"
                    style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border-token)" }}>
                    <div className="text-[13px] font-medium mb-1.5" style={{ lineHeight: 1.4 }}>{t.title}</div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <PriorityBadge p={t.priority} />
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium"
                        style={{ background: "var(--color-primary-highlight)", color: "var(--color-primary-token)" }}>
                        {t.agents?.name ?? "—"}
                      </span>
                      <span className="ml-auto text-[11px] font-mono" style={{ color: "var(--color-text-faint)" }}>
                        {timeAgo(t.created_at)}
                      </span>
                    </div>
                    {t.status === "queued" && (
                      <button onClick={() => runTask(t.id)}
                        className="mt-2.5 w-full px-2 py-1.5 rounded text-[12px] font-medium"
                        style={{ background: "var(--color-primary-highlight)", color: "var(--color-primary-token)" }}>
                        Run task
                      </button>
                    )}
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="text-[12px] text-center py-6" style={{ color: "var(--color-text-faint)" }}>
                    Empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <NewTaskModal open={open} onClose={() => setOpen(false)} onCreated={load} />
    </div>
  );
}

function PriorityBadge({ p }: { p: "low" | "med" | "high" }) {
  const map = {
    high: { bg: "var(--color-error-highlight)", fg: "var(--color-error)", label: "High" },
    med: { bg: "var(--color-warning-highlight)", fg: "var(--color-warning)", label: "Medium" },
    low: { bg: "var(--color-surface-offset)", fg: "var(--color-text-muted)", label: "Low" },
  } as const;
  const s = map[p];
  return (
    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{ background: s.bg, color: s.fg }}>{s.label}</span>
  );
}
