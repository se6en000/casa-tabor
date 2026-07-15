create table if not exists public.recurrence_rollout_audit (
  id uuid primary key default gen_random_uuid(),
  previous_flags jsonb not null,
  next_flags jsonb not null,
  reason text not null,
  actor text not null default 'service_role',
  created_at timestamptz not null default now()
);

alter table public.recurrence_rollout_audit enable row level security;
revoke all on table public.recurrence_rollout_audit from anon, authenticated;

create or replace function public.recurrence_set_rollout_flags(
  p_expected_flags jsonb,
  p_next_flags jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current jsonb;
  v_normalized jsonb;
begin
  if nullif(trim(p_reason), '') is null then raise exception 'A rollout reason is required'; end if;
  select value into v_current from public.settings where key = 'recurrence_v2_flags' for update;
  if v_current is distinct from p_expected_flags then
    raise exception 'Recurrence rollout flags changed concurrently';
  end if;
  v_normalized := jsonb_build_object(
    'recurrence_v2_read', coalesce((p_next_flags->>'recurrence_v2_read')::boolean, false),
    'recurrence_v2_write', coalesce((p_next_flags->>'recurrence_v2_write')::boolean, false),
    'google_sync_v2', coalesce((p_next_flags->>'google_sync_v2')::boolean, false),
    'recurrence_v2_delete', coalesce((p_next_flags->>'recurrence_v2_delete')::boolean, false)
  );
  if (v_normalized->>'recurrence_v2_write')::boolean
    and not (v_normalized->>'recurrence_v2_read')::boolean
  then raise exception 'Recurrence writes require recurrence reads'; end if;
  if (v_normalized->>'recurrence_v2_delete')::boolean
    and not (v_normalized->>'recurrence_v2_write')::boolean
  then raise exception 'Recurring deletion requires recurrence writes'; end if;
  if (v_normalized->>'google_sync_v2')::boolean
    and not (v_normalized->>'recurrence_v2_write')::boolean
  then raise exception 'Google projection requires recurrence writes'; end if;

  update public.settings
  set value = v_normalized, updated_at = now()
  where key = 'recurrence_v2_flags';
  insert into public.recurrence_rollout_audit (previous_flags, next_flags, reason)
  values (v_current, v_normalized, p_reason);
  return v_normalized;
end;
$$;

revoke all on function public.recurrence_set_rollout_flags(jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.recurrence_set_rollout_flags(jsonb, jsonb, text)
  to service_role;
