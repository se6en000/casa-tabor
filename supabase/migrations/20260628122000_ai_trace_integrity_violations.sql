create or replace view public.ai_trace_integrity_violations as
with session_rollup as (
  select
    e.session_id,
    max(e.received_at) as last_seen_at,
    max(e.device_id) filter (where e.device_id is not null and length(trim(e.device_id)) > 0) as device_id,
    max(e.platform) filter (where e.platform is not null and length(trim(e.platform)) > 0) as platform,
    bool_or(e.event = 'trace_started') as has_trace_started,
    bool_or(e.event in ('trace_outcome', 'turn_completed', 'turn_aborted', 'turn_timeout', 'asr_no_final')) as has_terminal_event,
    bool_or(e.event in ('voice_final', 'speech_trigger_final')) as has_final_event,
    bool_or(e.event = 'send_current_input') as has_send_event,
    bool_or(e.event like 'server_%') as has_server_activity
  from public.ai_drawer_debug_events e
  where e.session_id is not null
    and length(trim(e.session_id)) > 0
  group by e.session_id
)
select
  session_id,
  last_seen_at,
  device_id,
  platform,
  has_trace_started,
  has_terminal_event,
  has_final_event,
  has_send_event,
  has_server_activity,
  (has_server_activity and not has_trace_started) as missing_client_trace,
  (has_trace_started and not has_terminal_event) as missing_terminal,
  (has_send_event and not has_final_event) as send_without_final,
  (has_final_event and not has_send_event) as final_without_send
from session_rollup
where (has_server_activity and not has_trace_started)
   or (has_trace_started and not has_terminal_event)
   or (has_send_event and not has_final_event)
   or (has_final_event and not has_send_event);
