import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";
import { ROLE_OPTIONS, TOOL_OPTIONS } from "@/lib/format";
import { SUPPORTED_MODELS } from "@/lib/ai-gateway";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function NewAgentModal({ open, onClose, onCreated }: Props) {
  const userId = useAuth((s) => s.user?.id);
  const [name, setName] = useState("");
  const [role, setRole] = useState<(typeof ROLE_OPTIONS)[number]>("Research");
  const [model, setModel] = useState<string>(SUPPORTED_MODELS[0].id);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  const [autonomy, setAutonomy] = useState(2);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  function reset() {
    setName(""); setRole("Research"); setSystemPrompt(""); setTools([]); setAutonomy(2);
  }

  async function submit() {
    if (!userId || !name.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("agents")
      .insert({
        user_id: userId,
        name: name.trim(),
        role,
        model,
        system_prompt: systemPrompt,
        tools,
        autonomy,
      })
      .select()
      .single();
    if (!error && data) {
      await supabase.from("feed_events").insert({
        user_id: userId,
        kind: "agent_created",
        agent_id: data.id,
        message: `Created agent "${data.name}"`,
      });
      reset();
      onCreated?.();
      onClose();
    }
    setBusy(false);
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border-token)" }}
      >
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: "1px solid var(--color-border-token)" }}
        >
          <h3 className="text-[15px] font-semibold">New Agent</h3>
          <button onClick={onClose} style={{ color: "var(--color-text-muted)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Research Assistant"
              className="w-full px-3 py-2 rounded-md text-[13px]"
              style={inputStyle}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}
                className="w-full px-3 py-2 rounded-md text-[13px]" style={inputStyle}>
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Model">
              <select value={model} onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 rounded-md text-[13px]" style={inputStyle}>
                {SUPPORTED_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="System prompt">
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a specialized AI agent that…"
              rows={4}
              className="w-full px-3 py-2 rounded-md text-[13px] font-mono"
              style={inputStyle}
            />
          </Field>
          <Field label="Tools">
            <div className="grid grid-cols-2 gap-1.5">
              {TOOL_OPTIONS.map((t) => (
                <label key={t} className="flex items-center gap-2 text-[12.5px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tools.includes(t)}
                    onChange={(e) => setTools((prev) => e.target.checked ? [...prev, t] : prev.filter((x) => x !== t))}
                  />
                  <span style={{ color: "var(--color-text)" }}>{t}</span>
                </label>
              ))}
            </div>
          </Field>
          <Field label={`Autonomy: ${autonomy === 1 ? "Supervised" : autonomy === 2 ? "Semi-auto" : "Full Auto"}`}>
            <input type="range" min={1} max={3} value={autonomy}
              onChange={(e) => setAutonomy(Number(e.target.value))} className="w-full" />
          </Field>
        </div>

        <div
          className="flex items-center justify-end gap-2 px-5 py-3.5"
          style={{ borderTop: "1px solid var(--color-border-token)" }}
        >
          <button onClick={onClose} className="px-3.5 py-1.5 rounded-md text-[13px]"
            style={{ color: "var(--color-text-muted)" }}>Cancel</button>
          <button
            onClick={submit}
            disabled={busy || !name.trim()}
            className="px-3.5 py-1.5 rounded-md text-[13px] font-medium disabled:opacity-60"
            style={{ background: "var(--color-primary-token)", color: "#fff" }}
          >
            {busy ? "Creating…" : "Create agent"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[12px] font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>{label}</div>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--color-surface-offset)",
  border: "1px solid var(--color-border-token)",
  color: "var(--color-text)",
};
