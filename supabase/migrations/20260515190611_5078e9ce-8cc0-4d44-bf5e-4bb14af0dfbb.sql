-- Profiles: telegram linking
alter table public.profiles
  add column if not exists telegram_chat_id bigint,
  add column if not exists telegram_link_code text,
  add column if not exists telegram_link_code_expires_at timestamptz;

create unique index if not exists profiles_telegram_chat_id_idx
  on public.profiles (telegram_chat_id) where telegram_chat_id is not null;
create unique index if not exists profiles_telegram_link_code_idx
  on public.profiles (telegram_link_code) where telegram_link_code is not null;

-- Agents: chief flag
alter table public.agents
  add column if not exists is_chief boolean not null default false;

create unique index if not exists agents_one_chief_per_user
  on public.agents (user_id) where is_chief = true;

-- Chief messages (telegram conversation mirror)
create type chief_msg_direction as enum ('in', 'out');

create table public.chief_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  direction chief_msg_direction not null,
  text text not null,
  telegram_message_id bigint,
  created_at timestamptz not null default now()
);

create index chief_messages_user_created_idx
  on public.chief_messages (user_id, created_at desc);

alter table public.chief_messages enable row level security;

create policy "chief msgs owner select" on public.chief_messages
  for select using (auth.uid() = user_id);
create policy "chief msgs owner insert" on public.chief_messages
  for insert with check (auth.uid() = user_id);

alter publication supabase_realtime add table public.chief_messages;