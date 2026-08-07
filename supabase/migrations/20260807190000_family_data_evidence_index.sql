create extension if not exists vector with schema extensions;

create table if not exists public.family_data_documents (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (
    source_type in ('email', 'event', 'reminder', 'prep', 'activity', 'person', 'place', 'relationship', 'memory')
  ),
  source_id text not null,
  title text not null,
  redacted_text text not null default '',
  category text,
  entity_refs jsonb not null default '[]'::jsonb,
  occurred_at timestamptz,
  effective_at timestamptz,
  expires_at timestamptz,
  status text not null default 'active' check (
    status in ('active', 'superseded', 'expired', 'dismissed', 'deleted')
  ),
  confidence numeric(4,3) not null default 1 check (confidence >= 0 and confidence <= 1),
  privacy_class text not null default 'standard' check (
    privacy_class in ('standard', 'sensitive', 'excluded')
  ),
  content_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create index if not exists family_data_documents_retrieval_idx
  on public.family_data_documents(source_type, status, privacy_class, effective_at desc);
create index if not exists family_data_documents_expiry_idx
  on public.family_data_documents(expires_at)
  where expires_at is not null;
create index if not exists family_data_documents_entity_refs_idx
  on public.family_data_documents using gin(entity_refs);

create table if not exists public.family_data_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.family_data_documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  redacted_text text not null,
  search_vector tsvector generated always as (
    to_tsvector('english', coalesce(redacted_text, ''))
  ) stored,
  embedding extensions.vector(768),
  embedding_model text,
  content_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists family_data_chunks_search_idx
  on public.family_data_chunks using gin(search_vector);
create index if not exists family_data_chunks_embedding_idx
  on public.family_data_chunks using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

create table if not exists public.family_data_index_queue (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (
    source_type in ('email', 'event', 'reminder', 'prep', 'activity', 'person', 'place', 'relationship', 'memory')
  ),
  source_id text not null,
  operation text not null default 'upsert' check (operation in ('upsert', 'delete')),
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'completed', 'failed')
  ),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create index if not exists family_data_index_queue_ready_idx
  on public.family_data_index_queue(status, available_at, created_at)
  where status in ('pending', 'failed');

alter table public.family_data_documents enable row level security;
alter table public.family_data_chunks enable row level security;
alter table public.family_data_index_queue enable row level security;

create policy "family data documents service role access"
  on public.family_data_documents
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

create policy "family data chunks service role access"
  on public.family_data_chunks
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

create policy "family data index queue service role access"
  on public.family_data_index_queue
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop trigger if exists family_data_documents_updated_at on public.family_data_documents;
create trigger family_data_documents_updated_at
  before update on public.family_data_documents
  for each row execute function public.set_updated_at();

drop trigger if exists family_data_chunks_updated_at on public.family_data_chunks;
create trigger family_data_chunks_updated_at
  before update on public.family_data_chunks
  for each row execute function public.set_updated_at();

drop trigger if exists family_data_index_queue_updated_at on public.family_data_index_queue;
create trigger family_data_index_queue_updated_at
  before update on public.family_data_index_queue
  for each row execute function public.set_updated_at();

create or replace function public.claim_family_data_index_jobs(
  worker_id text,
  batch_size integer default 10
)
returns setof public.family_data_index_queue
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select id
    from public.family_data_index_queue
    where status in ('pending', 'failed')
      and available_at <= now()
    order by available_at, created_at
    for update skip locked
    limit greatest(1, least(batch_size, 50))
  ),
  claimed as (
    update public.family_data_index_queue as queue
    set
      status = 'processing',
      attempts = queue.attempts + 1,
      locked_at = now(),
      locked_by = worker_id,
      last_error = null
    from candidates
    where queue.id = candidates.id
    returning queue.*
  )
  select * from claimed;
$$;

revoke all on function public.claim_family_data_index_jobs(text, integer) from public;
grant execute on function public.claim_family_data_index_jobs(text, integer) to service_role;

create or replace function public.purge_expired_family_email_evidence(
  retention_interval interval default interval '4 months'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  if retention_interval < interval '1 day' then
    raise exception 'retention interval must be at least one day';
  end if;

  delete from public.family_data_documents
  where source_type = 'email'
    and coalesce(effective_at, occurred_at, updated_at) < now() - retention_interval;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.purge_expired_family_email_evidence(interval) from public;
grant execute on function public.purge_expired_family_email_evidence(interval) to service_role;
