-- Alexa tidies up (canvas 75; Jake, Oct 8: "have alexa review the day and maybe a few days forward and check if
-- reminders/events/todos should be merged or cleaned up with a suggested resolution"): each morning's suggestions — what
-- she found, what she'd do, the choices (each a few small ops) — and, once answered, what the rows were (Undo).
-- Written and read by the tidy function only.
create table if not exists public.tidy_suggestions (
  id uuid primary key default gen_random_uuid(),
  made_on date not null,
  kind text not null check (kind in ('copy', 'step_double', 'allday_double', 'stuck', 'same_thing')),
  pair_key text not null,
  items jsonb not null default '[]',
  says text not null,
  fix text not null,
  choices jsonb not null default '[]',
  why text,
  status text not null default 'open' check (status in ('open', 'done', 'kept', 'expired', 'undone')),
  chosen text,
  before jsonb,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tidy_suggestions_status_idx on public.tidy_suggestions (status, made_on desc);
create index if not exists tidy_suggestions_pair_idx on public.tidy_suggestions (pair_key);
alter table public.tidy_suggestions enable row level security;

-- Every morning at 6:30 Eastern (10:30 UTC), after the news and the calendars. The key from the vault.
do $$
declare v_job record;
begin
  for v_job in select jobid from cron.job where jobname = 'tidy-review' loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'tidy-review',
  '30 10 * * *',
  $$
  select net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/tidy',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        s.k,
      'Authorization', 'Bearer ' || s.k
    ),
    body    := '{"action":"review"}'::jsonb,
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
