create or replace function public.complete_reminder_with_linked_actions(
  p_reminder_id uuid,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reminder public.events%rowtype;
  linked_item record;
  linked_actions_completed integer := 0;
begin
  select *
  into reminder
  from public.events
  where id = p_reminder_id
  for update;

  if not found then
    raise exception 'Reminder not found';
  end if;
  if reminder.event_type <> 'reminder' then
    raise exception 'Only reminders can be completed';
  end if;
  if p_expected_updated_at is not null
    and reminder.updated_at <> p_expected_updated_at
  then
    raise exception 'Reminder changed before completion. Please review it again.';
  end if;

  update public.events
  set
    status = 'cancelled',
    updated_at = now()
  where id = p_reminder_id
    and status <> 'cancelled';

  for linked_item in
    select item.id
    from public.prep_items item
    where item.dismissed = false
      and item.source_type in ('reminder_manual', 'reminder_missed')
      and item.source_ref = p_reminder_id::text
    order by item.created_at, item.id
  loop
    perform public.resolve_prep_item(linked_item.id, 'done');
    linked_actions_completed := linked_actions_completed + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'reminder_id', p_reminder_id,
    'reminder_completed', true,
    'linked_actions_completed', linked_actions_completed
  );
end;
$$;

revoke all on function public.complete_reminder_with_linked_actions(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.complete_reminder_with_linked_actions(uuid, timestamptz)
  to anon, authenticated, service_role;

do $$
declare
  stale_item record;
begin
  for stale_item in
    select item.id
    from public.prep_items item
    join public.events reminder
      on reminder.id::text = item.source_ref
     and reminder.event_type = 'reminder'
     and reminder.status = 'cancelled'
    where item.dismissed = false
      and item.source_type in ('reminder_manual', 'reminder_missed')
  loop
    perform public.resolve_prep_item(stale_item.id, 'done');
  end loop;
end;
$$;
