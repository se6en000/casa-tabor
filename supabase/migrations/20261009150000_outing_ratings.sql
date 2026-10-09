-- The local guide learns from the two of them (Jake, Oct 9, canvas 85C–D: "a place where alexa can capture our reviews
-- after we go somewhere on the calendar. She can prompt a 'something for you' the next day"). Each morning the scout
-- finds yesterday's outings (supabase/functions/_shared/guide.mjs); each parent who went is asked on their own.
create table if not exists public.outing_ratings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.family_members(id) on delete cascade,
  title text not null,
  place text not null,
  address text,
  visited_at timestamptz not null,
  status text not null default 'ask' check (status in ('ask', 'rated', 'didnt_go', 'dismissed')),
  ask_after timestamptz not null default now(),
  stars smallint check (stars between 1 and 5),
  go_back text check (go_back in ('soon', 'someday', 'once')),
  stood_out text[],
  note text,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, member_id)
);
create index if not exists outing_ratings_member_idx on public.outing_ratings (member_id);
create index if not exists outing_ratings_status_idx on public.outing_ratings (status, ask_after);
alter table public.outing_ratings enable row level security;
drop policy if exists "family full access" on public.outing_ratings;
create policy "family full access" on public.outing_ratings for all using (true) with check (true);

-- 6:15 AM Eastern (10:15 UTC): yesterday's outings, asked about in Something for you.
select cron.unschedule(jobid) from cron.job where jobname = 'guide-rate-ask';
select cron.schedule(
  'guide-rate-ask',
  '15 10 * * *',
  $$
  select net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/scout',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        s.k,
      'Authorization', 'Bearer ' || s.k
    ),
    body    := '{"action":"rate_ask"}'::jsonb,
    timeout_milliseconds := 10000
  )
  from (
    select decrypted_secret as k
    from vault.decrypted_secrets
    where name = 'SUPABASE_ANON_KEY'
    limit 1
  ) s;
  $$
);
