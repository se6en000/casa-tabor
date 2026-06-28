alter table public.ai_drawer_debug_events
  add column if not exists dedupe_key text null;

create unique index if not exists ai_drawer_debug_events_dedupe_key_uidx
  on public.ai_drawer_debug_events(dedupe_key)
  where dedupe_key is not null;

create or replace view public.ai_forensics_timeline as
select
  e.received_at as at,
  coalesce(
    e.session_id,
    nullif(split_part(coalesce(e.correlation_id, ''), ':', 1), ''),
    e.correlation_id,
    e.id::text
  ) as trace_id,
  e.turn_id,
  e.action_id,
  e.lane,
  e.event as stage,
  e.detail,
  e.channel as source,
  e.payload,
  null::uuid as event_id
from public.ai_drawer_debug_events e
union all
select
  h.created_at as at,
  coalesce(h.trace_id, h.ai_session_id, h.action_id) as trace_id,
  h.turn_id,
  h.action_id,
  h.lane,
  ('history_' || h.tool || '_' || h.status) as stage,
  coalesce(h.error_message, '') as detail,
  'history'::text as source,
  h.result_payload as payload,
  h.event_id
from public.ai_event_edit_history h
union all
select
  ev.created_at as at,
  coalesce(ev.ai_origin_trace_id, ev.ai_last_trace_id, ev.id::text) as trace_id,
  coalesce(ev.ai_origin_turn_id, ev.ai_last_turn_id) as turn_id,
  coalesce(ev.ai_origin_action_id, ev.ai_last_action_id) as action_id,
  coalesce(ev.ai_origin_lane, ev.ai_last_lane) as lane,
  'event_row_created'::text as stage,
  ev.title as detail,
  'events'::text as source,
  jsonb_build_object(
    'start_time', ev.start_time,
    'end_time', ev.end_time,
    'status', ev.status,
    'google_event_id', ev.google_event_id,
    'origin_device_id', coalesce(ev.ai_origin_device_id, ev.ai_last_device_id)
  ) as payload,
  ev.id as event_id
from public.events ev;
