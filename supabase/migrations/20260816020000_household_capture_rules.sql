-- Household capture rules & training memory
create table if not exists public.household_capture_rules (
  id uuid primary key default gen_random_uuid(),
  pattern_type text not null check (pattern_type in ('domain', 'sender', 'subject')),
  pattern_value text not null,
  rule_directive text not null,
  origin text not null check (origin in ('user_label', 'manual_teach', 'learned_feedback')),
  confidence double precision not null default 1.0,
  active boolean not null default true,
  last_matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_household_capture_rules_pattern
  on public.household_capture_rules (pattern_type, lower(pattern_value));

alter table public.gmail_processed_messages
  add column if not exists is_user_labeled boolean default false,
  add column if not exists training_source text;

alter table public.prep_items
  add column if not exists is_user_labeled boolean default false,
  add column if not exists cluster_id text;

-- Enable RLS
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
