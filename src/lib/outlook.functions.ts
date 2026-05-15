import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGateway } from "./ai-gateway";

const OUTLOOK_GATEWAY_URL = "https://connector-gateway.lovable.dev/microsoft_outlook";
const EMAIL_AGENT_NAME = "Email Agent";

type OutlookMessage = {
  id: string;
  subject: string;
  preview: string;
  fromName: string;
  fromEmail: string;
  receivedAt: string;
  importance: "low" | "normal" | "high";
  isRead: boolean;
  webLink?: string;
};

function getOutlookCredentials() {
  const lovableApiKey = process.env.LOVABLE_API_KEY;
  const outlookApiKey = process.env.MICROSOFT_OUTLOOK_API_KEY;
  if (!lovableApiKey || !outlookApiKey) {
    return {
      connected: false as const,
      message: "Microsoft Outlook is not connected yet. Link the connector, then refresh AgentOS.",
    };
  }
  return { connected: true as const, lovableApiKey, outlookApiKey };
}

async function callOutlook<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const credentials = getOutlookCredentials();
  if (!credentials.connected) throw new Error(credentials.message);

  const response = await fetch(`${OUTLOOK_GATEWAY_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${credentials.lovableApiKey}`,
      "X-Connection-Api-Key": credentials.outlookApiKey,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after")) || 0;
      const delay = retryAfter > 0 ? retryAfter * 1000 : 800 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
      return callOutlook<T>(path, init, attempt + 1);
    }
    throw new Error(`Outlook API call failed [${response.status}]: ${text || response.statusText}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

function graphPath(path: string, params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) query.set(key, String(value));
  });
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

function toOutlookMessage(row: Record<string, unknown>): OutlookMessage {
  const from = row.from as { emailAddress?: { name?: string; address?: string } } | undefined;
  return {
    id: String(row.id ?? ""),
    subject: String(row.subject || "(No subject)"),
    preview: String(row.bodyPreview || ""),
    fromName: from?.emailAddress?.name || from?.emailAddress?.address || "Unknown sender",
    fromEmail: from?.emailAddress?.address || "",
    receivedAt: String(row.receivedDateTime || new Date().toISOString()),
    importance: (row.importance as OutlookMessage["importance"]) || "normal",
    isRead: Boolean(row.isRead),
    webLink: typeof row.webLink === "string" ? row.webLink : undefined,
  };
}

async function fetchOutlookMessages(limit: number, filter?: string) {
  const payload = await callOutlook<{ value?: Record<string, unknown>[] }>(
    graphPath("/me/messages", {
      $top: Math.min(Math.max(limit, 1), 25),
      $orderby: "receivedDateTime desc",
      $select: "id,subject,from,receivedDateTime,bodyPreview,importance,isRead,webLink",
      $filter: filter,
    }),
  );
  return (payload.value ?? []).map(toOutlookMessage).filter((message) => message.id);
}

async function getOrCreateEmailAgent(supabase: SupabaseClient<Database>, userId: string) {
  const { data: existing } = await supabase
    .from("agents")
    .select("id, name, task_count")
    .eq("name", EMAIL_AGENT_NAME)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing as { id: string; name: string; task_count: number };

  const { data: created, error } = await supabase
    .from("agents")
    .insert({
      user_id: userId,
      name: EMAIL_AGENT_NAME,
      role: "Email",
      model: "google/gemini-3-flash-preview",
      system_prompt:
        "You triage Microsoft Outlook inboxes, draft professional replies, and turn important messages into actionable tasks.",
      tools: ["Microsoft Outlook", "AI"],
      autonomy: 2,
    })
    .select("id, name, task_count")
    .single();

  if (error || !created) throw new Error(error?.message || "Could not create Email Agent");
  return created as { id: string; name: string; task_count: number };
}

export const getOutlookUnreadCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const credentials = getOutlookCredentials();
    if (!credentials.connected)
      return { connected: false, unread: 0, message: credentials.message };

    const payload = await callOutlook<{ "@odata.count"?: number; value?: unknown[] }>(
      graphPath("/me/messages", {
        $filter: "isRead eq false",
        $top: 1,
        $count: "true",
        $select: "id",
      }),
      { headers: { ConsistencyLevel: "eventual" } },
    );

    return { connected: true, unread: payload["@odata.count"] ?? payload.value?.length ?? 0 };
  });

export const getOutlookMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        mode: z.enum(["unread", "important", "recent"]).default("important"),
        limit: z.number().min(1).max(25).default(12),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const credentials = getOutlookCredentials();
    if (!credentials.connected)
      return { connected: false, messages: [] as OutlookMessage[], message: credentials.message };

    const filter =
      data.mode === "unread"
        ? "isRead eq false"
        : data.mode === "important"
          ? "importance eq 'high' or isRead eq false"
          : undefined;
    const messages = await fetchOutlookMessages(data.limit, filter);
    return { connected: true, messages };
  });

export const summarizeOutlookEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const credentials = getOutlookCredentials();
    if (!credentials.connected)
      return {
        connected: false,
        summary: "",
        messages: [] as OutlookMessage[],
        message: credentials.message,
      };

    const messages = await fetchOutlookMessages(10, "importance eq 'high' or isRead eq false");
    await supabase.from("feed_events").insert({
      user_id: userId,
      kind: "log",
      message: `Outlook Agent scanned ${messages.length} important emails`,
    });

    if (messages.length === 0) {
      const summary = "No unread or high-importance Outlook emails need attention right now.";
      await supabase
        .from("feed_events")
        .insert({ user_id: userId, kind: "log", message: "Outlook Agent completed inbox summary" });
      return { connected: true, summary, messages };
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const gateway = createLovableAiGateway(apiKey);
    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system:
        "You are an executive email triage assistant. Be concise, specific, and action-oriented.",
      prompt: `Summarize these Outlook emails into: 1) top priorities, 2) suggested replies, 3) task candidates. Emails:\n${JSON.stringify(messages, null, 2)}`,
    });

    await supabase
      .from("feed_events")
      .insert({ user_id: userId, kind: "log", message: "Outlook Agent completed inbox summary" });
    return { connected: true, summary: text, messages };
  });

export const sendOutlookEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        to: z.string().email(),
        subject: z.string().min(1).max(200),
        body: z.string().min(1).max(8000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const credentials = getOutlookCredentials();
    if (!credentials.connected) return { ok: false, message: credentials.message };
    await getOrCreateEmailAgent(supabase, userId);
    await callOutlook("/me/sendMail", {
      method: "POST",
      body: JSON.stringify({
        message: {
          subject: data.subject,
          body: { contentType: "Text", content: data.body },
          toRecipients: [{ emailAddress: { address: data.to } }],
        },
      }),
    });
    await supabase.from("feed_events").insert({
      user_id: userId,
      kind: "log",
      message: `Email Agent sent Outlook email to ${data.to}`,
    });
    return { ok: true };
  });

export const makeTaskFromOutlookEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ messageId: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const message = await callOutlook<Record<string, unknown>>(
      graphPath(`/me/messages/${encodeURIComponent(data.messageId)}`, {
        $select: "id,subject,from,receivedDateTime,bodyPreview,importance,body,webLink",
      }),
    );
    const email = toOutlookMessage(message);
    const agent = await getOrCreateEmailAgent(supabase, userId);
    const taskTitle = `Follow up: ${email.subject}`.slice(0, 180);
    const description = [
      `From: ${email.fromName} <${email.fromEmail}>`,
      `Received: ${email.receivedAt}`,
      email.webLink ? `Outlook link: ${email.webLink}` : "",
      "",
      email.preview,
    ]
      .filter(Boolean)
      .join("\n");

    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        user_id: userId,
        agent_id: agent.id,
        title: taskTitle,
        description,
        priority: email.importance === "high" ? "high" : "med",
      })
      .select("id, title")
      .single();
    if (error || !task) throw new Error(error?.message || "Could not create task from email");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const gateway = createLovableAiGateway(apiKey);
    const { text: plan } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system: "Turn emails into concise task plans with concrete subtasks.",
      prompt: `Create a short execution plan and 3-5 subtasks for this email-derived task.\nTitle: ${taskTitle}\n${description}`,
    });

    await supabase.from("task_steps").insert([
      {
        user_id: userId,
        task_id: task.id,
        type: "thought",
        content: `Triage email from ${email.fromName}`,
      },
      {
        user_id: userId,
        task_id: task.id,
        type: "action",
        content: "Generated task plan with Lovable AI",
      },
      { user_id: userId, task_id: task.id, type: "result", content: plan },
    ]);
    await supabase
      .from("agents")
      .update({ task_count: (agent.task_count ?? 0) + 1 })
      .eq("id", agent.id);
    await supabase.from("feed_events").insert({
      user_id: userId,
      kind: "task_created",
      agent_id: agent.id,
      task_id: task.id,
      message: `Created task from Outlook email: ${email.subject}`,
    });

    return { ok: true, taskId: task.id, plan };
  });
