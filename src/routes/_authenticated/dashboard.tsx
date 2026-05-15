import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { TrendingUp, Bot, ListChecks, CheckCircle2, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";
import { LiveFeed } from "@/components/live-feed";
import { OutlookPanel } from "@/components/outlook-panel";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Dashboard — AgentOS" }] }),
});

function DashboardPage() {
  const userId = useAuth((s) => s.user?.id);
  const [stats, setStats] = useState({ agents: 0, running: 0, today: 0, completed: 0, total: 0 });

  const load = useCallback(async () => {
    if (!userId) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [a, r, t, c, tot] = await Promise.all([
      supabase.from("agents").select("id", { count: "exact", head: true }),
      supabase.from("agents").select("id", { count: "exact", head: true }).eq("status", "running"),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .gte("created_at", today.toISOString()),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "completed"),
      supabase.from("tasks").select("id", { count: "exact", head: true }),
    ]);
    setStats({
      agents: a.count ?? 0,
      running: r.count ?? 0,
      today: t.count ?? 0,
      completed: c.count ?? 0,
      total: tot.count ?? 0,
    });
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel("dash-" + userId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agents", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, load]);

  const successRate =
    stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) + "%" : "—";

  const kpis = [
    {
      label: "Active Agents",
      value: String(stats.running),
      sub: `${stats.agents} total`,
      icon: Bot,
    },
    { label: "Tasks Today", value: String(stats.today), sub: "since midnight", icon: ListChecks },
    {
      label: "Success Rate",
      value: successRate,
      sub: `${stats.completed}/${stats.total}`,
      icon: CheckCircle2,
    },
    {
      label: "Status",
      value: stats.running > 0 ? "Live" : "Idle",
      sub: "fleet status",
      icon: Activity,
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ letterSpacing: "-0.02em" }}>
            Dashboard
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            Your agents are working for you right now.
          </p>
        </div>
      </div>

      <div
        className="grid gap-4 mb-6"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
      >
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div
              key={k.label}
              className="rounded-lg p-5"
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border-token)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className="text-[12px] font-medium uppercase"
                  style={{ color: "var(--color-text-muted)", letterSpacing: "0.05em" }}
                >
                  {k.label}
                </div>
                <Icon className="w-4 h-4" style={{ color: "var(--color-text-faint)" }} />
              </div>
              <div
                className="text-[28px] font-bold leading-none tabular-nums"
                style={{ letterSpacing: "-0.03em" }}
              >
                {k.value}
              </div>
              <div
                className="text-[12px] mt-1.5 flex items-center gap-1"
                style={{ color: "var(--color-text-muted)" }}
              >
                <TrendingUp className="w-3.5 h-3.5" /> {k.sub}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-6">
        <OutlookPanel />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div
          className="rounded-lg p-10 text-center"
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border-token)",
          }}
        >
          <div className="text-[14px] font-semibold mb-1">Welcome to AgentOS</div>
          <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            Create agents in <strong>Agents</strong>, then queue work in <strong>Tasks</strong>. AI
            runs are powered by Lovable AI Gateway.
          </p>
        </div>
        <LiveFeed />
      </div>
    </div>
  );
}
