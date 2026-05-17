import type { SupabaseClient } from "@supabase/supabase-js";

const EMBEDDING_MODEL = "google/text-embedding-004";
const EMBEDDING_DIM = 768;

/**
 * Generate a 768-dim embedding via Lovable AI Gateway (OpenAI-compatible /embeddings).
 * Returns null on failure so callers can degrade gracefully to keyword retrieval.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || !text.trim()) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text.slice(0, 8000) }),
    });
    if (!res.ok) {
      console.error("[embedText] gateway error", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const vec = json.data?.[0]?.embedding;
    if (!vec || vec.length !== EMBEDDING_DIM) return null;
    return vec;
  } catch (err) {
    console.error("[embedText] failed", err);
    return null;
  }
}

export type ChiefMemoryKind = "fact" | "preference" | "emotion" | "decision" | "project" | "summary";

export async function rememberChief(
  supabase: SupabaseClient,
  userId: string,
  args: { content: string; kind?: ChiefMemoryKind; importance?: number; tags?: string[] },
): Promise<{ id: string | null }> {
  const embedding = await embedText(args.content);
  const { data, error } = await supabase
    .from("chief_memories")
    .insert({
      user_id: userId,
      content: args.content,
      kind: args.kind ?? "fact",
      importance: Math.max(1, Math.min(5, args.importance ?? 3)),
      tags: args.tags ?? [],
      // pgvector accepts string form "[0.1,0.2,...]" when using JS clients
      embedding: embedding ? (`[${embedding.join(",")}]` as unknown as number[]) : null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[rememberChief]", error);
    return { id: null };
  }
  return { id: data.id };
}

export async function recallChief(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  limit = 6,
): Promise<Array<{ id: string; kind: string; content: string; importance: number; tags: string[]; similarity?: number }>> {
  const vec = await embedText(query);
  if (vec) {
    const { data, error } = await supabase.rpc("match_chief_memories", {
      p_user_id: userId,
      p_query_embedding: `[${vec.join(",")}]` as unknown as number[],
      p_match_count: limit,
    });
    if (!error && data) {
      // Touch last_accessed_at for retrieved memories
      const ids = data.map((m: { id: string }) => m.id);
      if (ids.length) {
        await supabase.from("chief_memories").update({ last_accessed_at: new Date().toISOString() }).in("id", ids);
      }
      return data as Array<{ id: string; kind: string; content: string; importance: number; tags: string[]; similarity: number }>;
    }
    console.error("[recallChief] rpc failed, falling back", error);
  }
  // Fallback: latest important memories
  const { data } = await supabase
    .from("chief_memories")
    .select("id, kind, content, importance, tags")
    .eq("user_id", userId)
    .order("importance", { ascending: false })
    .order("last_accessed_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Array<{ id: string; kind: string; content: string; importance: number; tags: string[] }>;
}
