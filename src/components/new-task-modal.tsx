import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

interface AgentLite { id: string; name: string }

export function NewTaskModal({ open, onClose, onCreated }: Props) {
  const userId = useAuth((s) => s.user?.id);
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [agentId, setAgentId] = useState("");
  const [priority, setPriority] = useState<"low" | "med" | "high">("med");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    supabase
      .from("agents")
      .select("id, name")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) {
          setAgents(data);
          if (!agentId && data[0]) setAgentId(data[0].id);
        }
      });
  }, [open, userId, agentId]);

  if (!open) return null;

  async function submit() {
    if (!userId || !title.trim() || !agentId) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: userId,
        agent_id: agentId,
        title: title.trim(),
        description,
        priority,
        due_date: dueDate || null,
      })
      .select("id, title, agent_id")
      .single();
    if (!error && data) {
      const agent = agents.find((a) => a.id === data.agent_id);
      await supabase.from("feed_events").insert({
        user_id: userId,
        kind: "task_created",
        agent_id: data.agent_id,
        task_id: data.id,
        message: `Queued "${data.title}" for ${agent?.name ?? "agent"}`,
      });
      setTitle(""); setDescription(""); setDueDate("");
      onCreated?.();
      onClose();
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border-token)" }}>
        <div className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: "1px solid var(--color-border-token)" }}>
          <h3 className="text-[15px] font-semibold">New Task</h3>
          <button onClick={onClose} style={{ color: "var(--color-text-muted)" }}><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {agents.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
              Create an agent first.
            </p>
          ) : (
            <>
              <Field label="Title">
                <input value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Research competitors in MENA market"
                  className="w-full px-3 py-2 rounded-md text-[13px]" style={inputStyle} />
              </Field>
              <Field label="Description">
                <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                  rows={3} placeholder="Describe what the agent should do…"
                  className="w-full px-3 py-2 rounded-md text-[13px]" style={inputStyle} />
              </Field>
              <Field label="Agent">
                <select value={agentId} onChange={(e) => setAgentId(e.target.value)}
                  className="w-full px-3 py-2 rounded-md text-[13px]" style={inputStyle}>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Priority">
                  <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}
                    className="w-full px-3 py-2 rounded-md text-[13px]" style={inputStyle}>
                    <option value="low">Low</option>
                    <option value="med">Medium</option>
                    <option value="high">High</option>
                  </select>
                </Field>
                <Field label="Due date">
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-md text-[13px]" style={inputStyle} />
                </Field>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5"
          style={{ borderTop: "1px solid var(--color-border-token)" }}>
          <button onClick={onClose} className="px-3.5 py-1.5 rounded-md text-[13px]"
            style={{ color: "var(--color-text-muted)" }}>Cancel</button>
          <button onClick={submit} disabled={busy || !title.trim() || !agentId}
            className="px-3.5 py-1.5 rounded-md text-[13px] font-medium disabled:opacity-60"
            style={{ background: "var(--color-primary-token)", color: "#fff" }}>
            {busy ? "Creating…" : "Create task"}
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
