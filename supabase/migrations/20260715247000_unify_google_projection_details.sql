create or replace function public.recurrence_build_reusable_patch(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with snapshot as (
    select public.recurrence_build_event_snapshot(p_event_id) value
  )
  select jsonb_build_object(
    'event', value->'event',
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'family_member_id', member->>'family_member_id',
        'role', member->>'role'
      ))
      from jsonb_array_elements(value->'members') member
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'family_member_id', event_member.family_member_id,
        'role', event_member.role,
        'name', family_member.name
      ) order by event_member.role, family_member.name)
      from public.event_members event_member
      join public.family_members family_member on family_member.id = event_member.family_member_id
      where event_member.event_id = p_event_id
    ), '[]'::jsonb),
    'enrichment', value->'enrichment',
    'plan_override', case
      when value->'plan_override' is null then null
      else (value->'plan_override') || jsonb_build_object(
        'driver_names',
        coalesce((
          select jsonb_object_agg(driver.key, family_member.name)
          from jsonb_each_text(coalesce(value#>'{plan_override,driver_overrides}', '{}'::jsonb)) driver
          join public.family_members family_member on family_member.id::text = driver.value
        ), '{}'::jsonb)
      )
    end,
    'transportation_plan', value#>'{plan_override,transportation_plan}',
    'logistics', value->'logistics',
    'checklist_definitions', coalesce((
      select jsonb_agg(item - 'id' - 'event_id' - 'checked' - 'created_at')
      from jsonb_array_elements(value->'checklist_items') item
    ), '[]'::jsonb),
    'action_definitions', coalesce((
      select jsonb_agg(item - 'id' - 'event_id' - 'due_date' - 'completed' - 'completed_at' - 'created_at')
      from jsonb_array_elements(value->'action_items') item
    ), '[]'::jsonb)
  )
  from snapshot;
$$;

create or replace function public.enqueue_google_sync_job(
  p_event_id uuid,
  p_audit_history_id uuid default null,
  p_error text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  select id
  into v_job_id
  from public.google_sync_jobs
  where event_id = p_event_id
    and status in ('pending', 'retrying')
  order by created_at desc
  limit 1
  for update;

  if found then
    update public.google_sync_jobs
    set next_retry_at = now(),
        last_error = coalesce(p_error, last_error),
        audit_history_id = coalesce(p_audit_history_id, audit_history_id),
        updated_at = now()
    where id = v_job_id;
    return v_job_id;
  end if;

  insert into public.google_sync_jobs (
    event_id,
    audit_history_id,
    status,
    last_error,
    next_retry_at,
    updated_at
  )
  values (
    p_event_id,
    p_audit_history_id,
    'pending',
    p_error,
    now(),
    now()
  )
  returning id into v_job_id;

  return v_job_id;
end;
$$;

create or replace function public.queue_google_projection_detail_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_event public.events%rowtype;
begin
  v_event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;

  select *
  into v_event
  from public.events
  where id = v_event_id;

  if not found
    or v_event.event_type = 'reminder'
    or v_event.deleted_at is not null
    or v_event.status = 'cancelled'
  then
    return null;
  end if;

  if v_event.series_id is not null
    or exists (
      select 1
      from public.event_series series
      where series.template_event_id = v_event_id
    )
  then
    return null;
  end if;

  perform public.enqueue_google_sync_job(
    v_event_id,
    null,
    'Google projection details changed.'
  );
  return null;
end;
$$;

revoke all on function public.queue_google_projection_detail_change() from public, anon, authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'event_plan_overrides',
    'event_enrichments',
    'event_members',
    'event_logistics',
    'event_checklist_items',
    'event_action_items'
  ]
  loop
    execute format('drop trigger if exists queue_google_projection_detail_change on public.%I', v_table);
    execute format(
      'create trigger queue_google_projection_detail_change after insert or update or delete on public.%I for each row execute function public.queue_google_projection_detail_change()',
      v_table
    );
  end loop;
end;
$$;
