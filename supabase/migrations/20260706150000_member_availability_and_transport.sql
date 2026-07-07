-- Member transport availability model
-- Captures:
-- 1) Whether a member can drive
-- 2) Their default flexibility profile
-- 3) Recurring weekly unavailable windows (e.g., work hours)
-- 4) Exception windows (e.g., day off, manual block)

alter table public.family_members
  add column if not exists can_drive boolean,
  add column if not exists availability_mode text;

update public.family_members
set can_drive = case
  when role in ('parent', 'caregiver') then true
  else false
end
where can_drive is null;

update public.family_members
set availability_mode = case
  when role = 'parent' then 'flexible'
  when role = 'caregiver' then 'strict'
  else 'strict'
end
where availability_mode is null;

alter table public.family_members
  alter column can_drive set default false,
  alter column can_drive set not null,
  alter column availability_mode set default 'flexible',
  alter column availability_mode set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'family_members_availability_mode_check'
      and conrelid = 'public.family_members'::regclass
  ) then
    alter table public.family_members
      add constraint family_members_availability_mode_check
      check (availability_mode in ('strict', 'flexible', 'open'));
  end if;
end
$$;

create table if not exists public.member_availability_rules (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.family_members(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_local time not null,
  end_local time not null,
  availability_type text not null check (availability_type in ('unavailable', 'available')),
  reason text,
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_availability_rules_time_check check (end_local > start_local)
);

create unique index if not exists member_availability_rules_member_day_window_idx
  on public.member_availability_rules(member_id, day_of_week, start_local, end_local, availability_type);

create index if not exists member_availability_rules_member_idx
  on public.member_availability_rules(member_id);

create index if not exists member_availability_rules_day_idx
  on public.member_availability_rules(day_of_week);

create table if not exists public.member_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.family_members(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  override_type text not null check (override_type in ('day_off', 'manual_block', 'manual_available')),
  note text,
  created_at timestamptz not null default now(),
  constraint member_availability_exceptions_time_check check (end_at > start_at)
);

create index if not exists member_availability_exceptions_member_idx
  on public.member_availability_exceptions(member_id);

create index if not exists member_availability_exceptions_window_idx
  on public.member_availability_exceptions(start_at, end_at);

alter table public.member_availability_rules enable row level security;
alter table public.member_availability_exceptions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'member_availability_rules'
      and policyname = 'availability rules read'
  ) then
    create policy "availability rules read"
      on public.member_availability_rules
      for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'member_availability_rules'
      and policyname = 'availability rules write'
  ) then
    create policy "availability rules write"
      on public.member_availability_rules
      for all
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'member_availability_exceptions'
      and policyname = 'availability exceptions read'
  ) then
    create policy "availability exceptions read"
      on public.member_availability_exceptions
      for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'member_availability_exceptions'
      and policyname = 'availability exceptions write'
  ) then
    create policy "availability exceptions write"
      on public.member_availability_exceptions
      for all
      using (true)
      with check (true);
  end if;
end
$$;
