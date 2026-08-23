-- ============================================================================
-- Migration: 20260824020000_expand_capture_rules_routing.sql
-- Subsystem: Milestone 4 Active Feedback Loop & Dynamic Rule Synthesis
-- Description: Expands household_capture_rules with voice directives, fast
--              dismissals, category routing, voice transcripts, and realtime sync.
-- ============================================================================

-- 1. Ensure base table exists
create table if not exists public.household_capture_rules (
  id uuid primary key default gen_random_uuid(),
  pattern_type text not null default 'domain',
  pattern_value text not null,
  rule_directive text not null default 'route_archetype',
  origin text not null default 'manual_teach',
  confidence double precision not null default 1.0,
  active boolean not null default true,
  last_matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Add new columns
alter table public.household_capture_rules
  add column if not exists default_archetype text,
  add column if not exists category_routing jsonb not null default '{}'::jsonb,
  add column if not exists voice_transcript text,
  add column if not exists feedback_count integer not null default 1;

-- 3. Update & expand check constraints safely
alter table public.household_capture_rules
  drop constraint if exists household_capture_rules_pattern_type_check,
  drop constraint if exists household_capture_rules_origin_check,
  drop constraint if exists household_capture_rules_default_archetype_check;

alter table public.household_capture_rules
  add constraint household_capture_rules_pattern_type_check
    check (pattern_type in ('domain', 'sender', 'subject', 'phrase')),
  add constraint household_capture_rules_origin_check
    check (origin in ('voice_directive', 'fast_dismissal', 'user_untrain', 'manual_teach', 'user_label', 'learned_feedback')),
  add constraint household_capture_rules_default_archetype_check
    check (
      default_archetype is null or
      default_archetype in (
        'logistics_parcels',
        'executive_actions',
        'temporal_appointments',
        'lifecycle_updates',
        'estate_knowledge',
        'promotional_noise'
      )
    );

-- 4. Create performance indexes
create unique index if not exists idx_household_capture_rules_pattern
  on public.household_capture_rules (pattern_type, lower(pattern_value));

create index if not exists idx_household_capture_rules_active_pattern
  on public.household_capture_rules (active, pattern_type, lower(pattern_value))
  where active = true;

create index if not exists idx_household_capture_rules_origin
  on public.household_capture_rules (origin);

create index if not exists idx_household_capture_rules_archetype
  on public.household_capture_rules (default_archetype)
  where default_archetype is not null;

-- 5. Enable Row Level Security & Policies
alter table public.household_capture_rules enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'household_capture_rules'
      and policyname = 'household_capture_rules_all'
  ) then
    create policy household_capture_rules_all
      on public.household_capture_rules
      for all
      to authenticated, anon, service_role
      using (true)
      with check (true);
  end if;
end $$;

-- 6. Enable Realtime Publications
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'household_capture_rules'
  ) then
    alter publication supabase_realtime add table public.household_capture_rules;
  end if;
exception
  when undefined_object then null;
  when others then null;
end $$;

-- 7. Trigger for automatic updated_at timestamp
create or replace function public.update_household_capture_rules_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_household_capture_rules_updated_at on public.household_capture_rules;
create trigger trg_household_capture_rules_updated_at
  before update on public.household_capture_rules
  for each row execute function public.update_household_capture_rules_updated_at();
