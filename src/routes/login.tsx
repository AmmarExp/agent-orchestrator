import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Cpu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Sign in — AgentOS" }] }),
});

function LoginPage() {
  const navigate = useNavigate();
  const session = useAuth((s) => s.session);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: "/dashboard" });
  }, [session, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4" style={{ background: "var(--color-bg)" }}>
      <div
        className="w-full max-w-sm rounded-xl p-8"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border-token)",
        }}
      >
        <div className="flex items-center gap-2.5 mb-6">
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center"
            style={{ background: "var(--color-primary-highlight)", color: "var(--color-primary-token)" }}
          >
            <Cpu className="w-4 h-4" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">AgentOS</h1>
        </div>

        <h2 className="text-xl font-bold tracking-tight mb-1">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h2>
        <p className="text-[13px] mb-5" style={{ color: "var(--color-text-muted)" }}>
          {mode === "signin" ? "Welcome back to your agents." : "Start orchestrating AI agents."}
        </p>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <Field label="Display name">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ada Lovelace"
                className="auth-input"
              />
            </Field>
          )}
          <Field label="Email">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="auth-input"
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="auth-input"
            />
          </Field>

          {err && (
            <div
              className="text-[12.5px] p-2 rounded-md"
              style={{ background: "var(--color-error-highlight)", color: "var(--color-error)" }}
            >
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 px-3.5 py-2.5 rounded-md text-[13.5px] font-medium transition-colors disabled:opacity-60"
            style={{ background: "var(--color-primary-token)", color: "#fff" }}
          >
            {loading ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="text-center text-[12.5px] mt-5" style={{ color: "var(--color-text-muted)" }}>
          {mode === "signin" ? "No account?" : "Already have one?"}{" "}
          <button
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setErr(null);
            }}
            className="font-medium"
            style={{ color: "var(--color-primary-token)" }}
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </div>

        <Link
          to="/"
          className="block text-center text-[12px] mt-4"
          style={{ color: "var(--color-text-faint)" }}
        >
          ← Back home
        </Link>
      </div>

      <style>{`
        .auth-input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          background: var(--color-surface-offset);
          border: 1px solid var(--color-border-token);
          border-radius: var(--radius-md-token);
          font-size: 13px;
          color: var(--color-text);
          transition: border-color 180ms;
        }
        .auth-input:focus { border-color: var(--color-primary-token); outline: none; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[12px] font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </div>
      {children}
    </label>
  );
}
