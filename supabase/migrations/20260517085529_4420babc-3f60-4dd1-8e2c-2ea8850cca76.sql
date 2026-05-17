
-- Move vector extension out of public schema
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION vector SET SCHEMA extensions;

-- Recreate match functions as SECURITY INVOKER (RLS handles scoping)
DROP FUNCTION IF EXISTS public.match_chief_memories(uuid, extensions.vector, int);
DROP FUNCTION IF EXISTS public.match_agent_memories(uuid, extensions.vector, int);

CREATE OR REPLACE FUNCTION public.match_chief_memories(
  p_user_id uuid,
  p_query_embedding extensions.vector(768),
  p_match_count int DEFAULT 8
) RETURNS TABLE (
  id uuid, kind public.memory_kind, content text,
  importance smallint, tags text[], similarity float
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, extensions
AS $$
  SELECT m.id, m.kind, m.content, m.importance, m.tags,
         1 - (m.embedding <=> p_query_embedding) AS similarity
  FROM public.chief_memories m
  WHERE m.user_id = p_user_id AND m.embedding IS NOT NULL
  ORDER BY m.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

CREATE OR REPLACE FUNCTION public.match_agent_memories(
  p_agent_id uuid,
  p_query_embedding extensions.vector(768),
  p_match_count int DEFAULT 8
) RETURNS TABLE (
  id uuid, kind public.memory_kind, content text,
  importance smallint, tags text[], similarity float
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, extensions
AS $$
  SELECT m.id, m.kind, m.content, m.importance, m.tags,
         1 - (m.embedding <=> p_query_embedding) AS similarity
  FROM public.agent_memories m
  WHERE m.agent_id = p_agent_id AND m.embedding IS NOT NULL
  ORDER BY m.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

REVOKE EXECUTE ON FUNCTION public.match_chief_memories FROM anon;
REVOKE EXECUTE ON FUNCTION public.match_agent_memories FROM anon;
