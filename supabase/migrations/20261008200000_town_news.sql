-- Around town (canvas 72C; Jake, Oct 8: "family news with outside news"): the morning paper's third page — the week's
-- emails from the schools, the city and county and the local papers, boiled down each morning to what reaches the
-- family. Each line names the email it came from. Written by the scout function ({ action: 'news' }); read through it.
create table if not exists public.town_news (
  id uuid primary key default gen_random_uuid(),
  news_date date not null,
  section text not null check (section in ('schools', 'city', 'papers')),
  headline text not null,
  line text not null default '',
  source text not null,
  source_date date,
  source_ref text,
  rank int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists town_news_date_idx on public.town_news (news_date desc, section, rank);
alter table public.town_news enable row level security;

-- Every morning at 5:15 Eastern (09:15 UTC; 4:15 in winter, still before the paper). The key from the vault.
do $$
declare v_job record;
begin
  for v_job in select jobid from cron.job where jobname = 'scout-news' loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'scout-news',
  '15 9 * * *',
  $$
  select net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/scout',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        s.k,
      'Authorization', 'Bearer ' || s.k
    ),
    body    := '{"action":"news"}'::jsonb,
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
