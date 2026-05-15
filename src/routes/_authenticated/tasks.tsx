import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
  head: () => ({ meta: [{ title: "Tasks — AgentOS" }] }),
});

function TasksPage() {
  return (
    <div>
      <h1 className="text-xl font-bold tracking-tight mb-6">Tasks</h1>
      <div
        className="rounded-lg p-10 text-center text-[13px]"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border-token)", color: "var(--color-text-muted)" }}
      >
        Kanban board comes in Phase 2.
      </div>
    </div>
  );
}
