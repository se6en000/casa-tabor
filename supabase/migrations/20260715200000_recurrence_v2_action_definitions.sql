alter table public.event_action_items
  add column if not exists template_due_offset_minutes integer;

comment on column public.event_action_items.template_due_offset_minutes is
  'Reusable due-time offset from the occurrence start. Absolute due_date and completion remain occurrence-specific.';
