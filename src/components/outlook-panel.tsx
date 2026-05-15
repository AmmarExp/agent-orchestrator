import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mail, Send, Sparkles, PlusCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  getOutlookMessages,
  makeTaskFromOutlookEmail,
  sendOutlookEmail,
  summarizeOutlookEmails,
} from "@/lib/outlook.functions";

type OutlookMessage = {
  id: string;
  subject: string;
  preview: string;
  fromName: string;
  fromEmail: string;
  receivedAt: string;
  importance: "low" | "normal" | "high";
  isRead: boolean;
};

type MessageState = {
  connected: boolean;
  messages: OutlookMessage[];
  message?: string;
};

const inputStyle: React.CSSProperties = {
  background: "var(--color-surface-offset)",
  border: "1px solid var(--color-border-token)",
  color: "var(--color-text)",
};

export function OutlookPanel() {
  const loadMessages = useServerFn(getOutlookMessages);
  const summarize = useServerFn(summarizeOutlookEmails);
  const makeTask = useServerFn(makeTaskFromOutlookEmail);
  const sendEmail = useServerFn(sendOutlookEmail);
  const [state, setState] = useState<MessageState>({ connected: true, messages: [] });
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sendForm, setSendForm] = useState({ to: "", subject: "", body: "" });
  const [sending, setSending] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const result = await loadMessages({ data: { mode: "important", limit: 12 } });
      setState(result);
    } catch (error) {
      setState({
        connected: false,
        messages: [],
        message: error instanceof Error ? error.message : "Outlook failed to load.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function runSummary() {
    setSummary("");
    try {
      const result = await summarize();
      if (!result.connected)
        setState((prev) => ({ ...prev, connected: false, message: result.message }));
      setSummary(result.summary);
      toast.success("Email Agent summary complete");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Email Agent failed");
    }
  }

  async function createTask(messageId: string) {
    setBusyId(messageId);
    try {
      await makeTask({ data: { messageId } });
      toast.success("Task created from Outlook email");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create task");
    } finally {
      setBusyId(null);
    }
  }

  async function submitEmail() {
    if (!sendForm.to || !sendForm.subject || !sendForm.body) return;
    setSending(true);
    try {
      await sendEmail({ data: sendForm });
      setSendForm({ to: "", subject: "", body: "" });
      toast.success("Email sent with Outlook");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send email");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[1.35fr_0.9fr]">
      <div
        className="rounded-lg overflow-hidden"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border-token)",
        }}
      >
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderBottom: "1px solid var(--color-border-token)" }}
        >
          <Mail className="w-4 h-4" style={{ color: "#0078d4" }} />
          <h2 className="text-[13px] font-semibold">Outlook Inbox</h2>
          <span
            className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
            style={{ background: "rgba(0,120,212,0.14)", color: "#62b5f7" }}
          >
            Outlook
          </span>
          <button
            onClick={refresh}
            className="ml-auto w-7 h-7 rounded-md flex items-center justify-center"
            style={{ color: "var(--color-text-muted)" }}
            title="Refresh Outlook"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {!state.connected && (
          <div
            className="m-4 rounded-lg p-4 text-[13px]"
            style={{
              background: "var(--color-warning-highlight)",
              color: "var(--color-warning)",
              border: "1px solid color-mix(in oklab, var(--color-warning) 35%, transparent)",
            }}
          >
            {state.message ?? "Microsoft Outlook is not connected yet."}
          </div>
        )}

        {loading ? (
          <InboxSkeleton />
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--color-divider)" }}>
            {state.messages.map((message) => (
              <article key={message.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(0,120,212,0.14)", color: "#62b5f7" }}
                  >
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-[13px] font-semibold truncate">{message.subject}</h3>
                      {!message.isRead && (
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: "var(--color-primary-token)" }}
                        />
                      )}
                    </div>
                    <p
                      className="text-[12px] truncate"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {message.fromName} · {message.fromEmail}
                    </p>
                    <p
                      className="text-[12.5px] mt-2 line-clamp-2"
                      style={{ color: "var(--color-text-muted)", lineHeight: 1.45 }}
                    >
                      {message.preview}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className="px-2 py-0.5 rounded-full text-[11px]"
                    style={{
                      background:
                        message.importance === "high"
                          ? "var(--color-error-highlight)"
                          : "var(--color-surface-offset)",
                      color:
                        message.importance === "high"
                          ? "var(--color-error)"
                          : "var(--color-text-muted)",
                    }}
                  >
                    {message.importance === "high"
                      ? "High priority"
                      : message.isRead
                        ? "Read"
                        : "Unread"}
                  </span>
                  <button
                    onClick={() => createTask(message.id)}
                    disabled={busyId === message.id}
                    className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium disabled:opacity-60"
                    style={{
                      background: "var(--color-primary-highlight)",
                      color: "var(--color-primary-token)",
                    }}
                  >
                    <PlusCircle className="w-3.5 h-3.5" />{" "}
                    {busyId === message.id ? "Creating…" : "Make Task"}
                  </button>
                </div>
              </article>
            ))}
            {state.messages.length === 0 && state.connected && (
              <div
                className="p-8 text-center text-[13px]"
                style={{ color: "var(--color-text-faint)" }}
              >
                No unread or high-priority Outlook emails.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div
          className="rounded-lg p-4"
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border-token)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4" style={{ color: "var(--color-primary-token)" }} />
            <h2 className="text-[13px] font-semibold">Email Agent</h2>
          </div>
          <button
            onClick={runSummary}
            className="w-full px-3 py-2 rounded-md text-[13px] font-medium"
            style={{
              background: "var(--color-primary-token)",
              color: "var(--color-primary-foreground)",
            }}
          >
            Summarize important emails
          </button>
          {summary && (
            <div
              className="mt-3 whitespace-pre-wrap text-[12.5px] leading-relaxed"
              style={{ color: "var(--color-text-muted)" }}
            >
              {summary}
            </div>
          )}
        </div>

        <div
          className="rounded-lg p-4"
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border-token)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Send className="w-4 h-4" style={{ color: "var(--color-primary-token)" }} />
            <h2 className="text-[13px] font-semibold">Send with Outlook</h2>
          </div>
          <div className="space-y-2.5">
            <input
              value={sendForm.to}
              onChange={(e) => setSendForm((f) => ({ ...f, to: e.target.value }))}
              placeholder="recipient@example.com"
              className="w-full px-3 py-2 rounded-md text-[13px]"
              style={inputStyle}
            />
            <input
              value={sendForm.subject}
              onChange={(e) => setSendForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="Subject"
              className="w-full px-3 py-2 rounded-md text-[13px]"
              style={inputStyle}
            />
            <textarea
              value={sendForm.body}
              onChange={(e) => setSendForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="Write a message…"
              rows={4}
              className="w-full px-3 py-2 rounded-md text-[13px]"
              style={inputStyle}
            />
            <button
              onClick={submitEmail}
              disabled={sending || !sendForm.to || !sendForm.subject || !sendForm.body}
              className="w-full px-3 py-2 rounded-md text-[13px] font-medium disabled:opacity-60"
              style={{
                background: "var(--color-primary-highlight)",
                color: "var(--color-primary-token)",
              }}
            >
              {sending ? "Sending…" : "Send email"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function InboxSkeleton() {
  return (
    <div className="p-4 space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="animate-pulse flex gap-3">
          <div
            className="w-8 h-8 rounded-lg"
            style={{ background: "var(--color-surface-offset)" }}
          />
          <div className="flex-1 space-y-2">
            <div
              className="h-3 rounded w-2/3"
              style={{ background: "var(--color-surface-offset)" }}
            />
            <div
              className="h-3 rounded w-1/2"
              style={{ background: "var(--color-surface-offset)" }}
            />
            <div
              className="h-3 rounded w-full"
              style={{ background: "var(--color-surface-offset)" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
