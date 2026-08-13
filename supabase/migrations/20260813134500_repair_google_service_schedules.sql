alter table public.google_tokens
  add column if not exists gmail_last_scan_attempt_at timestamptz,
  add column if not exists gmail_last_scan_success_at timestamptz,
  add column if not exists gmail_last_scan_error text;

create or replace view public.google_connection_status as
select
  tokens.family_member_id,
  tokens.google_email,
  tokens.connected_at,
  connection.last_incremental_sync_at as last_sync_at,
  connection.last_sync_error,
  tokens.gmail_scan_enabled,
  connection.id as connection_id,
  connection.calendar_id,
  connection.access_mode,
  connection.adoption_policy,
  connection.is_enabled,
  connection.health_status,
  connection.health_checked_at,
  connection.last_success_at,
  connection.last_error_at,
  connection.last_error_code,
  connection.health_status = 'reauthorization_required' as reauthorization_required,
  tokens.gmail_last_scan_attempt_at,
  tokens.gmail_last_scan_success_at,
  tokens.gmail_last_scan_error
from public.google_tokens tokens
left join public.calendar_connections connection
  on connection.family_member_id = tokens.family_member_id
 and connection.is_enabled;

grant select on public.google_connection_status to anon, authenticated;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
declare
  v_job record;
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'SUPABASE_ANON_KEY'
  ) then
    raise exception 'SUPABASE_ANON_KEY is missing from vault';
  end if;

  for v_job in
    select jobid from cron.job
    where jobname in ('sync-google-calendars', 'scan-gmail-inbox')
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'sync-google-calendars',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/sync-calendars',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY' limit 1),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'scan-gmail-inbox',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/scan-gmail-inbox',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY' limit 1),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
