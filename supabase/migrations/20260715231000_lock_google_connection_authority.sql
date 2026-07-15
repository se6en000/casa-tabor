drop policy if exists "allow all" on public.calendar_connections;

revoke all on table public.calendar_connections from anon, authenticated;

comment on table public.calendar_connections is
  'Service-role-only Google connection authority. Clients read google_connection_status.';
