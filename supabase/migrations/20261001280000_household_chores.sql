-- Household chores (Jake, 2026-10-01): "add a recurring reminder for chores (Trash to street Monday/Thursday,
-- landscaping to street Tuesdays), Give Liv her meds at 7PM M-F … not to get synced to Google, but for me to see on
-- the wall as reminders for that day, maybe show up on the score for that day." Their own table, so nothing here is
-- ever pushed to Google; a trip lists the traveller's chores to hand off while they're away (wall coverage.ts).
create table if not exists public.household_chores (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- Who does it (null: nobody yet — shown on the lane of who it's for).
  member_id uuid references public.family_members(id) on delete set null,
  -- Who it's about ("Give Liv her meds"), if anyone.
  for_member_id uuid references public.family_members(id) on delete set null,
  -- 0 = Sunday … 6 = Saturday, as the routines keep them.
  days_of_week smallint[] not null,
  time_local time not null,
  minutes smallint not null default 10,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists household_chores_member_id_idx on public.household_chores (member_id);
create index if not exists household_chores_for_member_id_idx on public.household_chores (for_member_id);
alter table public.household_chores enable row level security;
drop policy if exists "family full access" on public.household_chores;
create policy "family full access" on public.household_chores for all using (true) with check (true);

-- Jake's list, Oct 1 (the street ones at 8 PM until he says otherwise; who gives Liv her meds isn't said yet).
insert into public.household_chores (title, member_id, for_member_id, days_of_week, time_local)
select v.title, (select id from public.family_members where name = v.doer limit 1), (select id from public.family_members where name = v.for_whom limit 1), v.days, v.at
from (values
  ('Trash to the street', 'Jake', null, array[1, 4]::smallint[], '20:00'::time),
  ('Landscaping to the street', 'Jake', null, array[2]::smallint[], '20:00'::time),
  ('Give Liv her meds', null, 'Liv', array[1, 2, 3, 4, 5]::smallint[], '19:00'::time)
) as v(title, doer, for_whom, days, at)
where not exists (select 1 from public.household_chores c where c.title = v.title);

-- Jake: "kids chores as well, like change the cat litter every 4 weeks": every N weeks, counted from starts_on's week.
alter table public.household_chores add column if not exists every_weeks smallint not null default 1;
alter table public.household_chores add column if not exists starts_on date not null default current_date;
