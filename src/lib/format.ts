export function timeAgo(input: string | Date | number): string {
  const ts = typeof input === "string" ? new Date(input).getTime() : input instanceof Date ? input.getTime() : input;
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
  return Math.floor(diff / 86400000) + "d ago";
}

export const ROLE_OPTIONS = ["Research", "Coder", "Writer", "Analyst", "Scheduler", "Custom"] as const;
export const TOOL_OPTIONS = ["web_search", "scraper", "code_exec", "file_manager", "calendar", "email"] as const;
export const AUTONOMY_LABELS: Record<number, string> = { 1: "Supervised", 2: "Semi-auto", 3: "Full Auto" };
