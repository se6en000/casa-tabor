-- The "coming up" digest (FAMILY_WALL_PLAN.md P3.19 step 3). Per item (an event id): done, not
-- needed, snoozed, and the day it was last poked (so a poke goes out once). Server-only, like
-- gift_ideas: the `coming-up` function reads and writes it.
create table if not exists public.coming_up_state (
  item_key text primary key,
  done_at timestamptz,
  dismissed_at timestamptz,
  snoozed_until date,
  poked_on date,
  updated_at timestamptz not null default now()
);
alter table public.coming_up_state enable row level security;

-- Sunday 6 PM Eastern (22:00 UTC in daylight time): the week's digest to every phone.
-- Every morning 9 AM Eastern (13:00 UTC): a poke for anything whose plan-by day is today.
do $$
declare v_job record;
begin
  for v_job in select jobid from cron.job where jobname in ('coming-up-sunday-digest', 'coming-up-daily-pokes') loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'coming-up-sunday-digest',
  '0 22 * * 0',
  $$
  select net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/coming-up',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', s.k, 'Authorization', 'Bearer ' || s.k),
    body    := '{"action":"send_digest"}'::jsonb,
    timeout_milliseconds := 10000
  )
  from (select decrypted_secret as k from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY' limit 1) s;
  $$
);

select cron.schedule(
  'coming-up-daily-pokes',
  '0 13 * * *',
  $$
  select net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/coming-up',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', s.k, 'Authorization', 'Bearer ' || s.k),
    body    := '{"action":"send_pokes"}'::jsonb,
    timeout_milliseconds := 10000
  )
  from (select decrypted_secret as k from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY' limit 1) s;
  $$
);
