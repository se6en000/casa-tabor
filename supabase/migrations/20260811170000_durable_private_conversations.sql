create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.family_members(id) on delete cascade,
  visibility text not null default 'private' check (visibility in ('private')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  experience_mode text not null default 'do' check (experience_mode in ('do', 'talk_plan')),
  model_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  expires_at timestamptz not null
);

create index if not exists ai_conversations_owner_updated_idx
  on public.ai_conversations (owner_member_id, updated_at desc)
  where deleted_at is null;

create index if not exists ai_conversations_expiry_idx
  on public.ai_conversations (expires_at)
  where deleted_at is null;

create table if not exists public.ai_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  client_message_id text not null,
  sequence_number integer not null check (sequence_number > 0),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  evidence jsonb not null default '[]'::jsonb,
  sources_considered jsonb not null default '[]'::jsonb,
  partial_sources jsonb not null default '[]'::jsonb,
  conversation_state jsonb,
  tool_action jsonb,
  created_at timestamptz not null default now(),
  unique (conversation_id, client_message_id),
  unique (conversation_id, sequence_number)
);

create index if not exists ai_conversation_messages_conversation_sequence_idx
  on public.ai_conversation_messages (conversation_id, sequence_number);

create table if not exists public.ai_conversation_summaries (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  through_message_id text not null,
  content text not null,
  retrieval_scope text not null default 'conversation_only'
    check (retrieval_scope in ('conversation_only')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, through_message_id)
);

alter table public.ai_conversations enable row level security;
alter table public.ai_conversation_messages enable row level security;
alter table public.ai_conversation_summaries enable row level security;

drop policy if exists "ai conversations service role only" on public.ai_conversations;
create policy "ai conversations service role only"
  on public.ai_conversations
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "ai conversation messages service role only" on public.ai_conversation_messages;
create policy "ai conversation messages service role only"
  on public.ai_conversation_messages
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "ai conversation summaries service role only" on public.ai_conversation_summaries;
create policy "ai conversation summaries service role only"
  on public.ai_conversation_summaries
  for all
  to service_role
  using (true)
  with check (true);

drop trigger if exists ai_conversations_updated_at on public.ai_conversations;
create trigger ai_conversations_updated_at
  before update on public.ai_conversations
  for each row execute function public.set_updated_at();

drop trigger if exists ai_conversation_summaries_updated_at on public.ai_conversation_summaries;
create trigger ai_conversation_summaries_updated_at
  before update on public.ai_conversation_summaries
  for each row execute function public.set_updated_at();

create or replace function public.prune_expired_ai_conversations()
returns integer
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.ai_conversations
    where expires_at <= now()
    returning id
  )
  select count(*)::integer from deleted;
$$;

revoke all on function public.prune_expired_ai_conversations() from public, anon, authenticated;
grant execute on function public.prune_expired_ai_conversations() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'prune-expired-ai-conversations';
    perform cron.schedule(
      'prune-expired-ai-conversations',
      '30 4 * * *',
      'select public.prune_expired_ai_conversations()'
    );
  end if;
end;
$$;
