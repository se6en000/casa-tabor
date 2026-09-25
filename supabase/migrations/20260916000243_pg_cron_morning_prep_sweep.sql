-- Morning Prep reminders (Bedtime Prep Checklist, see createMorningPrepReminder
-- in src/lib/eventMutations.ts): a plain PostgREST `event_enrichments!inner(category)`
-- nested join is prohibited by this repo's own query-anti-patterns guardrail
-- (sequential-scan subplans), so the join lives in a real RPC instead.
create or replace function public.get_morning_prep_reminders(
  p_range_start timestamptz,
  p_range_end timestamptz
)
returns table (
  id uuid,
  title text,
  start_time timestamptz,
  end_time timestamptz,
  status text
)
language sql
security definer
set search_path = public
stable
as $$
  select e.id, e.title, e.start_time, e.end_time, e.status
  from public.events e
  join public.event_enrichments en on en.event_id = e.id
  where e.event_type = 'reminder'
    and en.category = 'morning_prep'
    and e.deleted_at is null
    and e.start_time >= p_range_start
    and e.start_time <= p_range_end
$$;

revoke all on function public.get_morning_prep_reminders(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_morning_prep_reminders(timestamptz, timestamptz)
  to anon, authenticated, service_role;

-- Schedule complete-morning-prep-reminders to run every 15 minutes.
-- The function itself no-ops before 9am ET; the 15-minute cadence just
-- keeps the sweep close behind the cutoff without polling aggressively.
select cron.schedule(
  'complete-morning-prep-reminders',
  '*/15 * * * *',
  $$
  select
    net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/complete-morning-prep-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    )
  $$
);
