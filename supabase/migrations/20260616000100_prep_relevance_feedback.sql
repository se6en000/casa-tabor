-- Prep/action relevance feedback across all sources

alter table public.prep_items
  add column if not exists source_type text not null default 'calendar_ai',
  add column if not exists source_ref text,
  add column if not exists source_pattern_key text,
  add column if not exists source_confidence real not null default 0.6,
  add column if not exists relevance_score real not null default 0,
  add column if not exists downvoted_count int not null default 0,
  add column if not exists last_feedback_at timestamptz;

create index if not exists prep_items_source_pattern_idx on public.prep_items(source_pattern_key);
create index if not exists prep_items_source_type_idx on public.prep_items(source_type);

create table if not exists public.prep_item_feedback (
  id uuid primary key default gen_random_uuid(),
  prep_item_id uuid references public.prep_items(id) on delete set null,
  source_type text,
  source_pattern_key text,
  source_ref text,
  feedback text not null default 'not_relevant',
  created_at timestamptz not null default now()
);

create index if not exists prep_item_feedback_pattern_idx on public.prep_item_feedback(source_pattern_key, created_at desc);

create table if not exists public.prep_item_suppressions (
  id uuid primary key default gen_random_uuid(),
  pattern_key text not null unique,
  strength int not null default 1,
  hard_suppressed boolean not null default false,
  last_feedback_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prep_item_suppressions_hard_idx on public.prep_item_suppressions(hard_suppressed, strength);

alter table public.prep_item_feedback enable row level security;
alter table public.prep_item_suppressions enable row level security;

drop policy if exists "family can read prep_item_feedback" on public.prep_item_feedback;
create policy "family can read prep_item_feedback"
  on public.prep_item_feedback for select using (true);

drop policy if exists "family can insert prep_item_feedback" on public.prep_item_feedback;
create policy "family can insert prep_item_feedback"
  on public.prep_item_feedback for insert with check (true);

drop policy if exists "service role full access prep_item_feedback" on public.prep_item_feedback;
create policy "service role full access prep_item_feedback"
  on public.prep_item_feedback for all using (true) with check (true);

drop policy if exists "family can read prep_item_suppressions" on public.prep_item_suppressions;
create policy "family can read prep_item_suppressions"
  on public.prep_item_suppressions for select using (true);

drop policy if exists "family can write prep_item_suppressions" on public.prep_item_suppressions;
create policy "family can write prep_item_suppressions"
  on public.prep_item_suppressions for all using (true) with check (true);

create or replace function public.set_prep_item_suppressions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_prep_item_suppressions_updated_at on public.prep_item_suppressions;
create trigger trg_prep_item_suppressions_updated_at
before update on public.prep_item_suppressions
for each row execute function public.set_prep_item_suppressions_updated_at();
