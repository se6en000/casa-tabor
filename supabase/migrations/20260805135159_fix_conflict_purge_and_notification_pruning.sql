-- Fixes a production bug where conflicts tied to past events never got
-- auto-expired: analyze-conflicts collected every non-deleted past event id
-- into a client-side `.or(event_a_id.in.(...),event_b_id.in.(...))` filter.
-- Once the household had hundreds of past events, that filter string grew to
-- tens of thousands of characters and the update request failed with
-- HTTP 400 (never checked/logged), so the purge silently did nothing. Any
-- conflict that never got marked resolved was then re-notified forever by
-- apply-notification-policy (every 6h dedupe window), making weeks-old
-- conflicts resurface in Recent Activity with a fresh "just now" timestamp.
--
-- Fix: do the purge as a single set-based SQL statement (no per-row id list,
-- so it can never hit a request-size limit again), and expose it as an RPC
-- the edge function can call directly.

create or replace function public.expire_past_conflicts(p_before timestamptz)
returns integer
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.conflicts c
    set resolved = true,
        resolution = 'auto-expired',
        resolved_at = now()
    where c.resolved = false
      and (
        exists (
          select 1 from public.events e
          where e.id = c.event_a_id
            and e.deleted_at is null
            and e.start_time < p_before
        )
        or exists (
          select 1 from public.events e
          where e.id = c.event_b_id
            and e.deleted_at is null
            and e.start_time < p_before
        )
      )
    returning c.id
  )
  select count(*)::integer from updated;
$$;

revoke all on function public.expire_past_conflicts(timestamptz) from public, anon, authenticated;
grant execute on function public.expire_past_conflicts(timestamptz) to service_role;

-- ── Date-aware conflict alerts for apply-notification-policy ──
-- apply-notification-policy previously fetched ANY unresolved conflict with
-- zero date filtering, so a conflict that (due to the bug above, or any other
-- reason) never got auto-expired would keep getting a fresh notification
-- every ~6h forever, regardless of how long ago its event happened. This RPC
-- does the "is this still relevant" check in SQL (Eastern calendar day, to
-- match how the rest of the app reasons about "today") so a conflict about a
-- past event can never generate a new notification, independent of whether
-- the purge job is healthy.

create or replace function public.get_active_conflict_alerts()
returns table (
  id uuid,
  severity integer,
  description text,
  event_a_id uuid,
  event_a_title text,
  event_a_start_time timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, c.severity, c.description, c.event_a_id, ea.title, ea.start_time
  from public.conflicts c
  join public.events ea on ea.id = c.event_a_id
  where c.resolved = false
    and (c.snoozed_until is null or c.snoozed_until <= now())
    and ea.deleted_at is null
    and (ea.start_time at time zone 'America/New_York')::date >= (now() at time zone 'America/New_York')::date
  order by c.severity desc
  limit 20;
$$;

revoke all on function public.get_active_conflict_alerts() from public, anon, authenticated;
grant execute on function public.get_active_conflict_alerts() to service_role;

-- ── Notification retention ──
-- Notifications never expired on their own; they just accumulated forever.
-- Prune anything older than 30 days regardless of read/type so Recent
-- Activity doesn't balloon with ancient, no-longer-actionable noise.

create or replace function public.prune_old_notifications()
returns integer
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.notifications
    where created_at < now() - interval '30 days'
    returning id
  )
  select count(*)::integer from deleted;
$$;

revoke all on function public.prune_old_notifications() from public, anon, authenticated;
grant execute on function public.prune_old_notifications() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'prune-old-notifications';
    perform cron.schedule(
      'prune-old-notifications',
      '20 4 * * *',
      'select public.prune_old_notifications()'
    );
  end if;
end;
$$;

-- ── One-time backfill ──
-- Resolve every already-stuck past conflict right now (rather than waiting for
-- the next scheduled analyze-conflicts run), and remove the already-created
-- "policy_conflict" notifications that were generated for events whose date
-- has already passed. This clears out the specific stale "Josh's/Sarah's"
-- style alerts immediately instead of leaving them to age out over the next
-- 30 days via the new retention job.
select public.expire_past_conflicts(now());

delete from public.notifications n
using public.events e
where n.type = 'policy_conflict'
  and n.event_id = e.id
  and e.deleted_at is null
  and (e.start_time at time zone 'America/New_York')::date < (now() at time zone 'America/New_York')::date;

