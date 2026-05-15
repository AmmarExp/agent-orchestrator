import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Bot,
  ListChecks,
  Settings,
  Cpu,
} from "lucide-react";

const items = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <aside
      className="flex flex-col fixed top-0 left-0 h-dvh z-[100]"
      style={{
        width: "var(--sidebar-w)",
        background: "var(--color-surface)",
        borderRight: "1px solid var(--color-border-token)",
      }}
    >
      <div
        className="flex items-center gap-2.5 px-4 flex-shrink-0"
        style={{
          height: "var(--topbar-h)",
          borderBottom: "1px solid var(--color-border-token)",
        }}
      >
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{ background: "var(--color-primary-highlight)", color: "var(--color-primary-token)" }}
        >
          <Cpu className="w-4 h-4" />
        </div>
        <span className="font-bold tracking-tight" style={{ fontSize: 15 }}>
          AgentOS
        </span>
      </div>

      <nav className="flex-1 py-2 overflow-y-auto">
        {items.map((item) => {
          const active = pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-2.5 px-4 py-2 mx-1.5 rounded-md font-medium transition-colors"
              style={{
                fontSize: 13.5,
                color: active ? "var(--color-primary-token)" : "var(--color-text-muted)",
                background: active ? "var(--color-primary-highlight)" : "transparent",
              }}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3" style={{ borderTop: "1px solid var(--color-border-token)" }}>
        <div className="text-xs" style={{ color: "var(--color-text-faint)" }}>
          v0.1 · Phase 1
        </div>
      </div>
    </aside>
  );
}
