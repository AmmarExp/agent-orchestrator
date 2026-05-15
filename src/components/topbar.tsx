import { useRouterState, useNavigate } from "@tanstack/react-router";
import { Search, LogOut, Bell } from "lucide-react";
import { useAuth } from "@/lib/auth-store";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getOutlookUnreadCount } from "@/lib/outlook.functions";

export function Topbar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const signOut = useAuth((s) => s.signOut);
  const user = useAuth((s) => s.user);
  const getUnread = useServerFn(getOutlookUnreadCount);
  const [unread, setUnread] = useState<number | null>(null);

  const crumb = pathname.split("/").filter(Boolean)[0] ?? "dashboard";

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    getUnread()
      .then((result) => {
        if (mounted) setUnread(result.connected ? result.unread : null);
      })
      .catch(() => {
        if (mounted) setUnread(null);
      });
    return () => { mounted = false; };
  }, [getUnread, user]);

  return (
    <header
      className="sticky top-0 z-[90] flex items-center gap-3 px-5 flex-shrink-0"
      style={{
        height: "var(--topbar-h)",
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border-token)",
      }}
    >
      <div className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
        AgentOS <span style={{ color: "var(--color-text)" }} className="font-medium capitalize">/ {crumb}</span>
      </div>
      <div className="flex-1" />
      <button
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12.5px] transition-colors"
        style={{
          background: "var(--color-surface-offset)",
          border: "1px solid var(--color-border-token)",
          color: "var(--color-text-muted)",
        }}
      >
        <Search className="w-3.5 h-3.5" /> Search
        <kbd
          className="px-1.5 py-0.5 rounded font-mono text-[11px]"
          style={{
            background: "var(--color-surface-dynamic)",
            border: "1px solid var(--color-border-token)",
          }}
        >
          ⌘K
        </kbd>
      </button>
      <button
        className="relative w-8 h-8 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--color-surface-offset)]"
        style={{ color: "var(--color-text-muted)" }}
        title="Outlook unread emails"
      >
        <Bell className="w-4 h-4" />
        {unread !== null && unread > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
            style={{ background: "#0078d4", color: "#fff" }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      <div className="text-xs hidden sm:block" style={{ color: "var(--color-text-faint)" }}>
        {user?.email}
      </div>
      <button
        onClick={async () => {
          await signOut();
          navigate({ to: "/login" });
        }}
        className="w-8 h-8 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--color-surface-offset)]"
        style={{ color: "var(--color-text-muted)" }}
        title="Sign out"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </header>
  );
}
