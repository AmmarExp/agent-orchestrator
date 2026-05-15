import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp, TrendingDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Dashboard — AgentOS" }] }),
});

const kpis = [
  { label: "Active Agents", value: "0", change: "+0", up: true },
  { label: "Tasks Today", value: "0", change: "+0%", up: true },
  { label: "Success Rate", value: "—", change: "+0%", up: true },
  { label: "Avg Latency", value: "—", change: "0ms", up: false },
];

function DashboardPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ letterSpacing: "-0.02em" }}>
            Dashboard
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            Overview of your agent fleet
          </p>
        </div>
      </div>

      <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-lg p-5"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border-token)" }}
          >
            <div
              className="text-[12px] font-medium uppercase mb-2"
              style={{ color: "var(--color-text-muted)", letterSpacing: "0.05em" }}
            >
              {k.label}
            </div>
            <div
              className="text-[28px] font-bold leading-none tabular-nums"
              style={{ letterSpacing: "-0.03em" }}
            >
              {k.value}
            </div>
            <div
              className="text-[12px] mt-1.5 flex items-center gap-1"
              style={{ color: k.up ? "var(--color-success)" : "var(--color-error)" }}
            >
              {k.up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {k.change}
            </div>
          </div>
        ))}
      </div>

      <div
        className="rounded-lg p-10 text-center"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border-token)" }}
      >
        <div className="text-[14px] font-semibold mb-1">Phase 1 ready</div>
        <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
          Auth, profiles, and design system are wired up. Phase 2 will add agents, tasks, realtime feed and AI integration.
        </p>
      </div>
    </div>
  );
}
