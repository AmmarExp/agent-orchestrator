import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-store";
import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "@/components/topbar";
import { Bot, LayoutDashboard, ListChecks, Settings } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ color: "var(--color-text-muted)" }}>
        Loading…
      </div>
    );
  }
  if (!session) return null;

  return (
    <div className="flex min-h-dvh">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0" style={{ marginLeft: "var(--sidebar-w)" }}>
        <Topbar />
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-y-auto">
          <Outlet />
        </main>
        <MobileNav />
      </div>
    </div>
  );
}

const mobileItems = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function MobileNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-[120] grid grid-cols-4"
      style={{ background: "var(--color-surface)", borderTop: "1px solid var(--color-border-token)" }}
    >
      {mobileItems.map((item) => {
        const Icon = item.icon;
        const active = pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            className="h-14 flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium"
            style={{ color: active ? "var(--color-primary-token)" : "var(--color-text-muted)" }}
          >
            <Icon className="w-4 h-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
