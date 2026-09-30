-- The Mac's to-do export learns whether a to-do has a date (2026-09-30; Jake: "the reminders with the 12am
-- end time, those are the ones that are the problem?"). Undated Casa to-dos carry a midnight placeholder
-- start_time; without has_due_date the Mac set that as the iOS due date, so they showed "12 AM" on the iPhone
-- and came back dated (the duplicate to-dos). With it, the Mac can leave the due date empty. The new column
-- is last, so anything reading the earlier columns is unchanged. Same grants as before.
drop function if exists public.get_todo_reminder_deltas(timestamptz, integer);

create function public.get_todo_reminder_deltas(p_since timestamptz, p_limit integer default 200)
returns table(id uuid, title text, start_time timestamptz, end_time timestamptz, status text, updated_at timestamptz, ios_reminder_id text, sync_version bigint, last_modified_source text, deleted boolean, deleted_at timestamptz, has_due_date boolean)
language sql
stable security definer
set search_path to 'public'
as $function$
  select
    e.id,
    e.title,
    e.start_time,
    e.end_time,
    e.status,
    e.updated_at,
    l.ios_reminder_id,
    coalesce(l.sync_version, 1) as sync_version,
    coalesce(l.last_modified_source, 'casa') as last_modified_source,
    (e.deleted_at is not null) as deleted,
    e.deleted_at,
    coalesce(e.has_due_date, true) as has_due_date
  from public.events e
  left join public.event_ios_reminder_links l on l.event_id = e.id
  left join public.event_enrichments en on en.event_id = e.id
  where e.event_type = 'reminder'
    and (en.category is null or en.category <> 'morning_prep')
    and (coalesce(l.last_modified_source, 'casa') <> 'ios' or e.deleted_at is not null)
    and (p_since is null or e.updated_at > p_since)
  order by e.updated_at asc
  limit greatest(1, least(coalesce(p_limit, 200), 500))
$function$;

revoke all on function public.get_todo_reminder_deltas(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.get_todo_reminder_deltas(timestamptz, integer)
  to anon, authenticated, service_role;
