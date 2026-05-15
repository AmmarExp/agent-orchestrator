import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Settings — AgentOS" }] }),
});

function SettingsPage() {
  const user = useAuth((s) => s.user);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setDisplayName(data?.display_name ?? ""));
  }, [user]);

  async function save() {
    if (!user) return;
    setSaving(true);
    await supabase.from("profiles").update({ display_name: displayName }).eq("id", user.id);
    setSaving(false);
    setSavedAt(Date.now());
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold tracking-tight mb-6">Settings</h1>

      <div
        className="rounded-lg p-5"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border-token)" }}
      >
        <h2 className="text-[14px] font-semibold mb-4">Profile</h2>

        <label className="block mb-4">
          <div className="text-[12px] font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
            Email
          </div>
          <div
            className="px-3 py-2 rounded-md text-[13px]"
            style={{ background: "var(--color-surface-offset)", border: "1px solid var(--color-border-token)", color: "var(--color-text-muted)" }}
          >
            {user?.email}
          </div>
        </label>

        <label className="block mb-4">
          <div className="text-[12px] font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
            Display name
          </div>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3 py-2 rounded-md text-[13px]"
            style={{ background: "var(--color-surface-offset)", border: "1px solid var(--color-border-token)", color: "var(--color-text)" }}
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="px-3.5 py-2 rounded-md text-[13px] font-medium disabled:opacity-60"
            style={{ background: "var(--color-primary-token)", color: "#fff" }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {savedAt && (
            <span className="text-[12px]" style={{ color: "var(--color-success)" }}>
              Saved
            </span>
          )}
        </div>
      </div>

      <p className="text-[12px] mt-4" style={{ color: "var(--color-text-faint)" }}>
        AI is powered by Lovable AI Gateway — no API keys needed. Coming in Phase 2.
      </p>
    </div>
  );
}
