type Status = "running" | "idle" | "error" | "queued" | "completed" | "failed";

const map: Record<Status, { bg: string; fg: string; label: string; pulse?: boolean }> = {
  running: { bg: "var(--color-primary-highlight)", fg: "var(--color-primary-token)", label: "Running", pulse: true },
  idle: { bg: "var(--color-surface-offset)", fg: "var(--color-text-muted)", label: "Idle" },
  error: { bg: "var(--color-error-highlight)", fg: "var(--color-error)", label: "Error" },
  queued: { bg: "var(--color-surface-offset)", fg: "var(--color-text-muted)", label: "Queued" },
  completed: { bg: "var(--color-success-highlight)", fg: "var(--color-success)", label: "Completed" },
  failed: { bg: "var(--color-error-highlight)", fg: "var(--color-error)", label: "Failed" },
};

export function StatusBadge({ status }: { status: Status }) {
  const s = map[status] ?? map.idle;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{ background: s.bg, color: s.fg }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: "currentColor", animation: s.pulse ? "pulse 1.5s ease-in-out infinite" : undefined }}
      />
      {s.label}
    </span>
  );
}
