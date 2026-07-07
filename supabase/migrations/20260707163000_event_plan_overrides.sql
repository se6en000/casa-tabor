create table if not exists public.event_plan_overrides (
  event_id uuid primary key references public.events(id) on delete cascade,
  verified boolean,
  waits boolean,
  driver_overrides jsonb not null default '{}'::jsonb,
  mode_override text check (mode_override in ('appointment', 'pickup', 'hosted', 'trip')),
  two_driver_confirmed boolean not null default false,
  location_signature text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_plan_overrides_updated_at_idx
  on public.event_plan_overrides (updated_at desc);

alter table public.event_plan_overrides enable row level security;

drop policy if exists "allow all" on public.event_plan_overrides;
create policy "allow all"
  on public.event_plan_overrides
  for all
  using (true)
  with check (true);

drop trigger if exists event_plan_overrides_updated_at on public.event_plan_overrides;
create trigger event_plan_overrides_updated_at
  before update on public.event_plan_overrides
  for each row execute function public.set_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_plan_overrides'
  ) then
    alter publication supabase_realtime add table public.event_plan_overrides;
  end if;
end $$;
