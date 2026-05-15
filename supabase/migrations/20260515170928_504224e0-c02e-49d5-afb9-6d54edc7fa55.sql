
-- Enums
create type public.agent_status as enum ('idle','running','error');
create type public.task_status as enum ('queued','running','completed','failed');
create type public.task_priority as enum ('low','med','high');
create type public.step_type as enum ('thought','action','result');
create type public.feed_kind as enum ('agent_created','agent_updated','agent_deleted','task_created','task_started','task_completed','task_failed','log');

-- Agents
create table public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'Custom',
  model text not null default 'google/gemini-3-flash-preview',
  system_prompt text not null default '',
  tools text[] not null default '{}',
  autonomy smallint not null default 2,
  status public.agent_status not null default 'idle',
  task_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.agents enable row level security;
create policy "agents owner select" on public.agents for select using (auth.uid() = user_id);
create policy "agents owner insert" on public.agents for insert with check (auth.uid() = user_id);
create policy "agents owner update" on public.agents for update using (auth.uid() = user_id);
create policy "agents owner delete" on public.agents for delete using (auth.uid() = user_id);
create trigger agents_set_updated_at before update on public.agents for each row execute function public.set_updated_at();
create index agents_user_id_idx on public.agents(user_id);

-- Tasks
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  title text not null,
  description text not null default '',
  priority public.task_priority not null default 'med',
  status public.task_status not null default 'queued',
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.tasks enable row level security;
create policy "tasks owner select" on public.tasks for select using (auth.uid() = user_id);
create policy "tasks owner insert" on public.tasks for insert with check (auth.uid() = user_id);
create policy "tasks owner update" on public.tasks for update using (auth.uid() = user_id);
create policy "tasks owner delete" on public.tasks for delete using (auth.uid() = user_id);
create trigger tasks_set_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create index tasks_user_id_idx on public.tasks(user_id);
create index tasks_agent_id_idx on public.tasks(agent_id);

-- Task steps
create table public.task_steps (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type public.step_type not null,
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.task_steps enable row level security;
create policy "steps owner select" on public.task_steps for select using (auth.uid() = user_id);
create policy "steps owner insert" on public.task_steps for insert with check (auth.uid() = user_id);
create policy "steps owner delete" on public.task_steps for delete using (auth.uid() = user_id);
create index task_steps_task_id_idx on public.task_steps(task_id, created_at);

-- Feed events
create table public.feed_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.feed_kind not null,
  agent_id uuid references public.agents(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  message text not null,
  created_at timestamptz not null default now()
);
alter table public.feed_events enable row level security;
create policy "feed owner select" on public.feed_events for select using (auth.uid() = user_id);
create policy "feed owner insert" on public.feed_events for insert with check (auth.uid() = user_id);
create index feed_events_user_id_idx on public.feed_events(user_id, created_at desc);

-- Realtime
alter publication supabase_realtime add table public.feed_events;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.task_steps;
alter publication supabase_realtime add table public.agents;
