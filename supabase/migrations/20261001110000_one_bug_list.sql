-- One bug list (FAMILY_WALL_PLAN.md, 2026-09-30): the wall's bug button wrote to ai_drawer_debug_events
-- (event 'user_bug_report', with the whole conversation), while "file a bug report" by voice wrote to
-- ai_bug_reports — so "what's on the bug reports" missed 15 of them. Every bug-button report now lands in
-- ai_bug_reports too (the debug row stays, for the trace), once, with the conversation as its transcript.
alter table public.ai_bug_reports add column if not exists debug_event_id uuid;
create unique index if not exists ai_bug_reports_debug_event_id_key on public.ai_bug_reports (debug_event_id);

create or replace function public.bug_report_from_debug_event(e public.ai_drawer_debug_events)
returns void
language sql
as $$
  insert into public.ai_bug_reports (title, details, severity, status, source, discovered_at, transcript, page, session_id, device_id, member_name, debug_event_id)
  values (
    left(coalesce(nullif(btrim(e.payload->'feedback'->>'expected'), ''), nullif(btrim(e.payload->'feedback'->>'happened'), ''), nullif(btrim(e.detail), ''), 'Bug report'), 160),
    e.detail,
    'medium',
    'open',
    'user',
    e.received_at,
    e.payload->'conversation',
    e.page,
    e.session_id,
    e.device_id,
    e.payload->'context'->>'viewer',
    e.id
  )
  on conflict (debug_event_id) do nothing
$$;

create or replace function public.bug_report_from_debug_event_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.bug_report_from_debug_event(new);
  return new;
end;
$$;

drop trigger if exists bug_report_from_debug_event on public.ai_drawer_debug_events;
create trigger bug_report_from_debug_event
  after insert on public.ai_drawer_debug_events
  for each row when (new.event = 'user_bug_report')
  execute function public.bug_report_from_debug_event_trigger();

-- The ones already sent.
select public.bug_report_from_debug_event(e) from public.ai_drawer_debug_events e where e.event = 'user_bug_report';
