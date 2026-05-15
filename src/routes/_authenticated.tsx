import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-store";
import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "@/components/topbar";

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
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
