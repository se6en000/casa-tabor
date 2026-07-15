create table if not exists public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  family_member_id uuid references public.family_members(id) on delete restrict,
  google_email text not null,
  calendar_id text not null default 'primary',
  access_mode text not null check (access_mode in ('writable', 'read_only')),
  adoption_policy text not null check (adoption_policy in ('automatic', 'explicit', 'none')),
  is_enabled boolean not null default true,
  sync_token text,
  last_full_sync_at timestamptz,
  last_incremental_sync_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (google_email, calendar_id)
);

create table if not exists public.event_series (
  id uuid primary key default gen_random_uuid(),
  template_event_id uuid not null unique references public.events(id) on delete restrict,
  timezone text not null default 'America/New_York',
  recurrence_lines jsonb not null default '[]'::jsonb
    check (jsonb_typeof(recurrence_lines) = 'array'),
  status text not null default 'active' check (status in ('active', 'deleted')),
  revision bigint not null default 1 check (revision > 0),
  ownership text not null default 'casa'
    check (ownership in ('casa', 'google_adopted', 'read_only_import')),
  source_connection_id uuid references public.calendar_connections(id) on delete set null,
  google_calendar_id text,
  google_recurring_event_id text,
  google_ical_uid text,
  google_etag text,
  google_updated_at timestamptz,
  last_projected_revision bigint,
  projection_hash text,
  deleted_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'active' and deleted_at is null and purge_after is null)
    or (status = 'deleted' and deleted_at is not null and purge_after is not null)
  )
);

alter table public.events
  add column if not exists record_kind text not null default 'single',
  add column if not exists series_id uuid references public.event_series(id) on delete restrict,
  add column if not exists occurrence_key text,
  add column if not exists original_start_time timestamptz,
  add column if not exists original_start_date date,
  add column if not exists is_exception boolean not null default false,
  add column if not exists exception_paths jsonb not null default '[]'::jsonb,
  add column if not exists series_revision_applied bigint,
  add column if not exists google_ical_uid text,
  add column if not exists google_etag text,
  add column if not exists google_updated_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists purge_after timestamptz;

alter table public.events
  drop constraint if exists events_record_kind_check,
  add constraint events_record_kind_check
    check (record_kind in ('single', 'series_template', 'occurrence')),
  drop constraint if exists events_exception_paths_array_check,
  add constraint events_exception_paths_array_check
    check (jsonb_typeof(exception_paths) = 'array'),
  drop constraint if exists events_occurrence_identity_check,
  add constraint events_occurrence_identity_check
    check (
      (record_kind = 'occurrence' and series_id is not null and occurrence_key is not null)
      or (record_kind <> 'occurrence')
    ),
  drop constraint if exists events_template_series_check,
  add constraint events_template_series_check
    check (
      (record_kind = 'series_template' and series_id is null)
      or record_kind <> 'series_template'
    ),
  drop constraint if exists events_tombstone_check,
  add constraint events_tombstone_check
    check (
      (deleted_at is null and purge_after is null)
      or (deleted_at is not null and purge_after is not null)
    );

create unique index if not exists events_series_occurrence_key_unique
  on public.events (series_id, occurrence_key)
  where series_id is not null and occurrence_key is not null;

create index if not exists events_series_start_idx
  on public.events (series_id, start_time)
  where series_id is not null;

create index if not exists events_tombstone_purge_idx
  on public.events (purge_after)
  where deleted_at is not null;

alter table public.event_checklist_items
  add column if not exists template_item_key uuid not null default gen_random_uuid(),
  add column if not exists template_revision bigint;

alter table public.event_action_items
  add column if not exists template_item_key uuid not null default gen_random_uuid(),
  add column if not exists template_revision bigint;

alter table public.event_logistics
  add column if not exists template_item_key uuid not null default gen_random_uuid(),
  add column if not exists template_revision bigint;

create index if not exists event_checklist_items_template_key_idx
  on public.event_checklist_items (event_id, template_item_key);

create index if not exists event_action_items_template_key_idx
  on public.event_action_items (event_id, template_item_key);

create index if not exists event_logistics_template_key_idx
  on public.event_logistics (event_id, template_item_key);

create table if not exists public.recurrence_mutation_history (
  id uuid primary key default gen_random_uuid(),
  action_id text not null unique,
  series_id uuid references public.event_series(id) on delete set null,
  selected_event_id uuid references public.events(id) on delete set null,
  scope text not null check (scope in ('this', 'future', 'all')),
  mutation_type text not null
    check (mutation_type in ('update', 'delete', 'restore', 'reset_exceptions', 'convert_to_recurring', 'convert_to_single')),
  expected_series_revision bigint,
  applied_series_revision bigint,
  actor jsonb not null default '{}'::jsonb,
  correlation_id text not null,
  request_payload jsonb not null default '{}'::jsonb,
  before_state jsonb,
  after_state jsonb,
  status text not null default 'applied' check (status in ('applied', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists recurrence_mutation_history_series_created_idx
  on public.recurrence_mutation_history (series_id, created_at desc);

create table if not exists public.calendar_sync_operations (
  id uuid primary key default gen_random_uuid(),
  action_id text not null,
  operation_key text not null,
  series_id uuid references public.event_series(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  connection_id uuid not null references public.calendar_connections(id) on delete restrict,
  operation_type text not null
    check (operation_type in ('create_master', 'patch_master', 'delete_master', 'patch_instance', 'cancel_instance', 'restore_instance', 'split_series', 'recreate_projection')),
  casa_revision bigint not null check (casa_revision > 0),
  payload_snapshot jsonb not null default '{}'::jsonb,
  depends_on_operation_id uuid references public.calendar_sync_operations(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'retrying', 'running', 'succeeded', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 12 check (max_attempts > 0),
  next_retry_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  last_error text,
  google_response jsonb,
  correlation_id text not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (action_id, operation_key),
  check (series_id is not null or event_id is not null)
);

create index if not exists calendar_sync_operations_ready_idx
  on public.calendar_sync_operations (status, next_retry_at, created_at)
  where status in ('pending', 'retrying');

create index if not exists calendar_sync_operations_series_idx
  on public.calendar_sync_operations (series_id, created_at desc);

create index if not exists calendar_sync_operations_event_idx
  on public.calendar_sync_operations (event_id, created_at desc);

alter table public.calendar_connections enable row level security;
alter table public.event_series enable row level security;
alter table public.recurrence_mutation_history enable row level security;
alter table public.calendar_sync_operations enable row level security;

drop policy if exists "allow all" on public.calendar_connections;
create policy "allow all" on public.calendar_connections
  for all using (true) with check (true);

drop policy if exists "allow all" on public.event_series;
create policy "allow all" on public.event_series
  for all using (true) with check (true);

drop policy if exists "allow all" on public.recurrence_mutation_history;
create policy "allow all" on public.recurrence_mutation_history
  for all using (true) with check (true);

drop policy if exists "allow all" on public.calendar_sync_operations;
create policy "allow all" on public.calendar_sync_operations
  for all using (true) with check (true);

drop trigger if exists calendar_connections_updated_at on public.calendar_connections;
create trigger calendar_connections_updated_at
  before update on public.calendar_connections
  for each row execute function public.set_updated_at();

drop trigger if exists event_series_updated_at on public.event_series;
create trigger event_series_updated_at
  before update on public.event_series
  for each row execute function public.set_updated_at();

drop trigger if exists calendar_sync_operations_updated_at on public.calendar_sync_operations;
create trigger calendar_sync_operations_updated_at
  before update on public.calendar_sync_operations
  for each row execute function public.set_updated_at();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'calendar_connections',
    'event_series',
    'recurrence_mutation_history',
    'calendar_sync_operations'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
