
-- Enable pgvector for semantic memory search
CREATE EXTENSION IF NOT EXISTS vector;

-- Mood column on chief messages
ALTER TABLE public.chief_messages
  ADD COLUMN IF NOT EXISTS mood text,
  ADD COLUMN IF NOT EXISTS is_summary boolean NOT NULL DEFAULT false;

-- Chief long-term memory
CREATE TYPE public.memory_kind AS ENUM ('fact','preference','emotion','decision','project','summary');

CREATE TABLE public.chief_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind public.memory_kind NOT NULL DEFAULT 'fact',
  content text NOT NULL,
  embedding vector(768),
  importance smallint NOT NULL DEFAULT 3,
  tags text[] NOT NULL DEFAULT '{}',
  last_accessed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chief_memories_user_idx ON public.chief_memories(user_id);
CREATE INDEX chief_memories_embedding_idx ON public.chief_memories
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.chief_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chief_memories owner select" ON public.chief_memories
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "chief_memories owner insert" ON public.chief_memories
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chief_memories owner update" ON public.chief_memories
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "chief_memories owner delete" ON public.chief_memories
  FOR DELETE USING (auth.uid() = user_id);

-- Per-agent memory
CREATE TABLE public.agent_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind public.memory_kind NOT NULL DEFAULT 'fact',
  content text NOT NULL,
  embedding vector(768),
  importance smallint NOT NULL DEFAULT 3,
  tags text[] NOT NULL DEFAULT '{}',
  last_accessed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_memories_agent_idx ON public.agent_memories(agent_id);
CREATE INDEX agent_memories_embedding_idx ON public.agent_memories
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.agent_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_memories owner select" ON public.agent_memories
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "agent_memories owner insert" ON public.agent_memories
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "agent_memories owner update" ON public.agent_memories
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "agent_memories owner delete" ON public.agent_memories
  FOR DELETE USING (auth.uid() = user_id);

-- Semantic search for chief memories
CREATE OR REPLACE FUNCTION public.match_chief_memories(
  p_user_id uuid,
  p_query_embedding vector(768),
  p_match_count int DEFAULT 8
) RETURNS TABLE (
  id uuid, kind public.memory_kind, content text,
  importance smallint, tags text[], similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.id, m.kind, m.content, m.importance, m.tags,
         1 - (m.embedding <=> p_query_embedding) AS similarity
  FROM public.chief_memories m
  WHERE m.user_id = p_user_id AND m.embedding IS NOT NULL
  ORDER BY m.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

-- Semantic search for agent memories
CREATE OR REPLACE FUNCTION public.match_agent_memories(
  p_agent_id uuid,
  p_query_embedding vector(768),
  p_match_count int DEFAULT 8
) RETURNS TABLE (
  id uuid, kind public.memory_kind, content text,
  importance smallint, tags text[], similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.id, m.kind, m.content, m.importance, m.tags,
         1 - (m.embedding <=> p_query_embedding) AS similarity
  FROM public.agent_memories m
  WHERE m.agent_id = p_agent_id AND m.embedding IS NOT NULL
  ORDER BY m.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;
