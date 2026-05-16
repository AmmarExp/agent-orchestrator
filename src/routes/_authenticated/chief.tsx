import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Crown, Send, Link2, RefreshCw, Bot, Clock, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";
import {
  ensureChiefAgent,
  generateChiefLinkCode,
  getChiefStatus,
  registerTelegramWebhook,
  sendChiefMessageFromApp,
  unlinkTelegram,
} from "@/lib/chief.functions";

export const Route = createFileRoute("/_authenticated/chief")({
  component: ChiefPage,
  head: () => ({ meta: [{ title: "Chief — AgentOS" }] }),
});

interface Msg {
  id: string;
  direction: "in" | "out";
  text: string;
  created_at: string;
}

function ChiefPage() {
  const userId = useAuth((s) => s.user?.id);
  const qc = useQueryClient();
  const ensure = useServerFn(ensureChiefAgent);
  const status = useServerFn(getChiefStatus);
  const genCode = useServerFn(generateChiefLinkCode);
  const registerHook = useServerFn(registerTelegramWebhook);
  const sendMsg = useServerFn(sendChiefMessageFromApp);

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Ensure chief exists on mount
  useEffect(() => {
    ensure().catch(() => {});
  }, [ensure]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["chief-status"],
    queryFn: () => status(),
  });

  const [liveMessages, setLiveMessages] = useState<Msg[] | null>(null);
  const messages: Msg[] = liveMessages ?? (data?.messages as Msg[] | undefined) ?? [];

  useEffect(() => {
    setLiveMessages(null);
  }, [data?.messages]);

  // Realtime subscription
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel("chief-msgs-" + userId)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chief_messages", filter: `user_id=eq.${userId}` },
        (payload) => {
          const m = payload.new as Msg;
          setLiveMessages((prev) => {
            const base = prev ?? (data?.messages as Msg[] | undefined) ?? [];
            if (base.some((x) => x.id === m.id)) return base;
            return [...base, m];
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, data?.messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const sendMutation = useMutation({
    mutationFn: (text: string) => sendMsg({ data: { text } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chief-status"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Send failed"),
  });

  const handleSend = useCallback(() => {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    sendMutation.mutate(t);
  }, [draft, sendMutation]);

  const handleGenCode = async () => {
    try {
      await genCode();
      toast.success("Link code generated — valid for 1 hour");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const unlink = useServerFn(unlinkTelegram);
  const [unlinking, setUnlinking] = useState(false);

  const handleUnlink = async () => {
    if (!confirm("Unlink your Telegram account from Chief? You can re-link any time.")) return;
    setUnlinking(true);
    try {
      await unlink();
      toast.success("Telegram unlinked");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unlink");
    } finally {
      setUnlinking(false);
    }
  };

  const handleRegisterHook = async () => {
    try {
      // Always use the stable project dev URL for Telegram webhooks — preview URLs
      // (id-preview--...) can redirect through auth and are not stable across builds.
      const projectId = "9b55bede-d52a-4cf7-a7de-0d8d31175721";
      const host = window.location.host.includes("lovable.app") ? "lovable.app" : window.location.host.split(".").slice(-2).join(".");
      const url = `https://project--${projectId}-dev.${host}/api/public/telegram/webhook`;
      const res = await registerHook({ data: { url } });
      toast.success(res.ok ? `Webhook registered ✓ → ${url}` : `Webhook: ${res.description ?? "unknown"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Webhook failed");
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #f5c542, #b8860b)",
              color: "#1a1200",
              boxShadow: "0 8px 24px -8px rgba(245,197,66,0.5)",
            }}
          >
            <Crown className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ letterSpacing: "-0.02em" }}>
              Chief
            </h1>
            <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
              Your master orchestrator on Telegram.
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {data?.linkedChatId && (
            <button
              onClick={handleUnlink}
              disabled={unlinking}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-[12.5px] font-medium disabled:opacity-50"
              style={{ background: "#ef444420", color: "#ef4444", border: "1px solid #ef444440" }}
            >
              <Link2 className="w-3.5 h-3.5" />
              {unlinking ? "Unlinking…" : "Unlink Telegram"}
            </button>
          )}
          <button
            onClick={handleRegisterHook}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-[12.5px] font-medium"
            style={{ background: "var(--color-surface-offset)", color: "var(--color-text)" }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Register webhook
          </button>
        </div>
      </header>

      {/* Connection status */}
      <div
        className="rounded-lg p-4 grid gap-3 md:grid-cols-3"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border-token)" }}
      >
        <StatusCell label="Telegram connector" value={data?.tgConnected ? "Connected" : "Not connected"} ok={data?.tgConnected} />
        <StatusCell label="Bot" value={data?.botUsername ? `@${data.botUsername}` : "—"} ok={!!data?.botUsername} />
        <StatusCell
          label="Your chat"
          value={data?.linkedChatId ? `Linked (${data.linkedChatId})` : "Not linked"}
          ok={!!data?.linkedChatId}
        />
      </div>

      {/* Linking */}
      {!data?.linkedChatId && data?.botUsername && (
        <div
          className="rounded-lg p-5"
          style={{
            background: "var(--color-primary-highlight)",
            border: "1px solid var(--color-border-token)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Link2 className="w-4 h-4" style={{ color: "var(--color-primary-token)" }} />
            <div className="text-[14px] font-semibold">Link your Telegram</div>
          </div>
          <ol className="text-[13px] space-y-1 mb-3" style={{ color: "var(--color-text-muted)" }}>
            <li>
              1. Open{" "}
              <a
                href={`https://t.me/${data.botUsername}`}
                target="_blank"
                rel="noreferrer"
                className="underline font-medium"
                style={{ color: "var(--color-primary-token)" }}
              >
                @{data.botUsername}
              </a>
            </li>
            <li>2. Generate a code below and send: <code className="font-mono">/link YOURCODE</code></li>
          </ol>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleGenCode}
              className="px-3.5 py-2 rounded-md text-[13px] font-medium"
              style={{ background: "var(--color-primary-token)", color: "#fff" }}
            >
              Generate link code
            </button>
            {data.linkCode && (
              <div className="flex items-center gap-2">
                <code
                  className="px-3 py-2 rounded-md font-mono text-[14px] font-bold tracking-widest"
                  style={{ background: "var(--color-surface)", border: "1px dashed var(--color-border-token)" }}
                >
                  /link {data.linkCode}
                </code>
                <CopyButton text={`/link ${data.linkCode}`} />
              </div>
            )}
          </div>
          {data.linkCode && data.linkCodeExpiresAt && (
            <div className="mt-2">
              <LinkCodeCountdown
                expiresAt={data.linkCodeExpiresAt}
                onExpired={() => refetch()}
              />
            </div>
          )}
        </div>
      )}

      {/* Chat mirror */}
      <div
        className="rounded-lg flex flex-col"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border-token)",
          height: "min(60vh, 560px)",
        }}
      >
        <div
          className="px-4 py-2.5 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--color-divider)" }}
        >
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <Bot className="w-4 h-4" style={{ color: "#f5c542" }} />
            Conversation with Chief
          </div>
          <span className="text-[11px]" style={{ color: "var(--color-text-faint)" }}>
            Mirrors Telegram in real-time
          </span>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading && <div className="text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>Loading…</div>}
          {!isLoading && messages.length === 0 && (
            <div className="text-center text-[12.5px] mt-8" style={{ color: "var(--color-text-muted)" }}>
              No messages yet. Say hello to Chief.
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.direction === "in" ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[80%] px-3.5 py-2 rounded-2xl text-[13.5px] whitespace-pre-wrap"
                style={{
                  background:
                    m.direction === "in" ? "var(--color-primary-token)" : "var(--color-surface-offset)",
                  color: m.direction === "in" ? "#fff" : "var(--color-text)",
                  borderBottomRightRadius: m.direction === "in" ? 4 : undefined,
                  borderBottomLeftRadius: m.direction === "out" ? 4 : undefined,
                }}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 flex gap-2" style={{ borderTop: "1px solid var(--color-divider)" }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Message Chief… (English or العربية)"
            className="flex-1 px-3.5 py-2.5 rounded-md text-[13.5px] outline-none"
            style={{
              background: "var(--color-surface-offset)",
              border: "1px solid var(--color-border-token)",
              color: "var(--color-text)",
            }}
          />
          <button
            onClick={handleSend}
            disabled={sendMutation.isPending || !draft.trim()}
            className="px-4 rounded-md flex items-center gap-2 text-[13px] font-medium disabled:opacity-50"
            style={{ background: "var(--color-primary-token)", color: "#fff" }}
          >
            <Send className="w-4 h-4" />
            {sendMutation.isPending ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusCell({ label, value, ok }: { label: string; value: string; ok?: boolean | null }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--color-text-faint)" }}>
        {label}
      </div>
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: ok ? "#22c55e" : "#ef4444" }}
        />
        {value}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      className="flex items-center justify-center w-8 h-8 rounded-md transition-colors"
      style={{
        background: copied ? "#22c55e22" : "var(--color-surface)",
        border: "1px solid var(--color-border-token)",
        color: copied ? "#22c55e" : "var(--color-text-muted)",
      }}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function LinkCodeCountdown({ expiresAt, onExpired }: { expiresAt: string; onExpired: () => void }) {
  const getSecondsLeft = () => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const [secondsLeft, setSecondsLeft] = useState(getSecondsLeft);

  useEffect(() => {
    if (secondsLeft === 0) {
      onExpired();
      return;
    }
    const id = setInterval(() => {
      const s = getSecondsLeft();
      setSecondsLeft(s);
      if (s === 0) {
        clearInterval(id);
        onExpired();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const isUrgent = secondsLeft < 120;

  if (secondsLeft === 0) {
    return (
      <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "#ef4444" }}>
        <Clock className="w-3 h-3" />
        Code expired — generate a new one
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 text-[12px]"
      style={{ color: isUrgent ? "#f59e0b" : "var(--color-text-muted)" }}
    >
      <Clock className="w-3 h-3" />
      Expires in{" "}
      <span className="font-mono font-semibold">
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </span>
    </div>
  );
}
