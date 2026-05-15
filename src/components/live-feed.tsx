import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-store";
import { supabase } from "@/integrations/supabase/client";
import { timeAgo } from "@/lib/format";
import { Activity } from "lucide-react";

type FeedRow = {
  id: string;
  kind: string;
  message: string;
  created_at: string;
};

export function LiveFeed() {
  const userId = useAuth((s) => s.user?.id);
  const [items, setItems] = useState<FeedRow[]>([]);

  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    supabase
      .from("feed_events")
      .select("id, kind, message, created_at")
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (mounted && data) setItems(data as FeedRow[]);
      });

    const ch = supabase
      .channel("feed-events-" + userId)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "feed_events", filter: `user_id=eq.${userId}` },
        (payload) => {
          setItems((prev) => [payload.new as FeedRow, ...prev].slice(0, 30));
        },
      )
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [userId]);

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border-token)" }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: "1px solid var(--color-border-token)" }}
      >
        <Activity className="w-4 h-4" style={{ color: "var(--color-primary-token)" }} />
        <span className="text-[13px] font-semibold">Live Feed</span>
        <span
          className="ml-auto w-1.5 h-1.5 rounded-full"
          style={{ background: "var(--color-success)", animation: "pulse 1.5s ease-in-out infinite" }}
        />
      </div>
      <div className="flex flex-col max-h-[420px] overflow-y-auto">
        {items.length === 0 && (
          <div className="p-6 text-center text-[12.5px]" style={{ color: "var(--color-text-faint)" }}>
            No activity yet. Run a task to see live updates.
          </div>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="px-4 py-2.5 text-[12.5px]"
            style={{ borderBottom: "1px solid var(--color-divider)", color: "var(--color-text)" }}
          >
            <div>{item.message}</div>
            <div className="text-[11px] mt-0.5 font-mono" style={{ color: "var(--color-text-faint)" }}>
              {timeAgo(item.created_at)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
