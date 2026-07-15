insert into public.settings (key, value, updated_at)
values (
  'recurrence_v2_flags',
  jsonb_build_object(
    'recurrence_v2_read', false,
    'recurrence_v2_write', false,
    'google_sync_v2', false,
    'recurrence_v2_delete', false
  ),
  now()
)
on conflict (key) do nothing;
