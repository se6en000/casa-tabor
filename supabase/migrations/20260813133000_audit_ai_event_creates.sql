alter table public.ai_event_edit_history
  drop constraint if exists ai_event_edit_history_tool_check;

alter table public.ai_event_edit_history
  add constraint ai_event_edit_history_tool_check
  check (tool in ('create_event', 'update_event', 'undo_event_edit'));

comment on table public.ai_event_edit_history is
  'Durable audit history for AI-originated event creates, updates, and undo actions.';
