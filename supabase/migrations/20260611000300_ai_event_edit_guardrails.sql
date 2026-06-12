create table if not exists public.ai_event_edit_history (
  id uuid primary key default gen_random_uuid(),
  action_id text not null unique,
  event_id uuid references public.events(id) on delete set null,
  tool text not null check (tool in ('update_event', 'undo_event_edit')),
  ai_session_id text,
  confirmed_by_user boolean not null default true,
  request_payload jsonb not null default '{}'::jsonb,
  before_state jsonb,
  after_state jsonb,
  status text not null default 'applied' check (status in ('applied', 'failed')),
  sync_status text not null default 'not_needed' check (sync_status in ('not_needed', 'pending', 'retrying', 'succeeded', 'failed')),
  result_payload jsonb,
  error_message text,
  reverted_history_id uuid references public.ai_event_edit_history(id) on delete set null,
  undone_at timestamptz,
  undone_by_history_id uuid references public.ai_event_edit_history(id) on delete set null,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ai_event_edit_history_event_created_idx
  on public.ai_event_edit_history(event_id, created_at desc);

create table if not exists public.google_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  audit_history_id uuid references public.ai_event_edit_history(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'retrying', 'running', 'succeeded', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  last_error text,
  last_attempt_at timestamptz,
  next_retry_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists google_sync_jobs_status_retry_idx
  on public.google_sync_jobs(status, next_retry_at);

create index if not exists google_sync_jobs_audit_history_idx
  on public.google_sync_jobs(audit_history_id);

create or replace function public.ai_build_event_snapshot(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'event', to_jsonb(e),
    'enrichment', (
      select to_jsonb(enr)
      from public.event_enrichments enr
      where enr.event_id = e.id
      limit 1
    ),
    'checklist_items', coalesce((
      select jsonb_agg(to_jsonb(ci) order by ci.sort_order, ci.created_at, ci.id)
      from public.event_checklist_items ci
      where ci.event_id = e.id
    ), '[]'::jsonb),
    'action_items', coalesce((
      select jsonb_agg(to_jsonb(ai) order by ai.created_at, ai.id)
      from public.event_action_items ai
      where ai.event_id = e.id
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(to_jsonb(em) order by em.role, em.family_member_id)
      from public.event_members em
      where em.event_id = e.id
    ), '[]'::jsonb)
  )
  from public.events e
  where e.id = p_event_id;
$$;

create or replace function public.ai_restore_event_snapshot(
  p_event_id uuid,
  p_snapshot jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_event public.events%rowtype;
begin
  if p_snapshot is null or p_snapshot->'event' is null then
    raise exception 'Snapshot is required';
  end if;

  select * into v_event
  from jsonb_populate_record(null::public.events, p_snapshot->'event');

  update public.events
  set
    title = v_event.title,
    start_time = v_event.start_time,
    end_time = v_event.end_time,
    location_name = v_event.location_name,
    address = v_event.address,
    description = v_event.description,
    all_day = v_event.all_day,
    is_enriched = v_event.is_enriched,
    updated_at = v_now
  where id = p_event_id;

  delete from public.event_enrichments where event_id = p_event_id;
  if p_snapshot->'enrichment' is not null and p_snapshot->'enrichment' <> 'null'::jsonb then
    insert into public.event_enrichments
    select *
    from jsonb_populate_record(
      null::public.event_enrichments,
      jsonb_set(p_snapshot->'enrichment', '{updated_at}', to_jsonb(v_now), true)
    );
  end if;

  delete from public.event_checklist_items where event_id = p_event_id;
  if jsonb_typeof(p_snapshot->'checklist_items') = 'array'
    and jsonb_array_length(p_snapshot->'checklist_items') > 0
  then
    insert into public.event_checklist_items
    select *
    from jsonb_populate_recordset(null::public.event_checklist_items, p_snapshot->'checklist_items');
  end if;

  delete from public.event_action_items where event_id = p_event_id;
  if jsonb_typeof(p_snapshot->'action_items') = 'array'
    and jsonb_array_length(p_snapshot->'action_items') > 0
  then
    insert into public.event_action_items
    select *
    from jsonb_populate_recordset(null::public.event_action_items, p_snapshot->'action_items');
  end if;

  delete from public.event_members where event_id = p_event_id;
  if jsonb_typeof(p_snapshot->'members') = 'array'
    and jsonb_array_length(p_snapshot->'members') > 0
  then
    insert into public.event_members
    select *
    from jsonb_populate_recordset(null::public.event_members, p_snapshot->'members');
  end if;
end;
$$;

create or replace function public.ai_apply_event_update(
  p_event_id uuid,
  p_event_updates jsonb default '{}'::jsonb,
  p_enrichment_updates jsonb default '{}'::jsonb,
  p_checklist_items jsonb default null,
  p_action_items jsonb default null,
  p_members_add uuid[] default array[]::uuid[],
  p_members_remove uuid[] default array[]::uuid[],
  p_action_id text default null,
  p_expected_updated_at timestamptz default null,
  p_request_payload jsonb default '{}'::jsonb,
  p_ai_session_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_item jsonb;
  v_index integer := 0;
  v_before jsonb;
  v_after jsonb;
  v_history_id uuid;
  v_existing_history_id uuid;
  v_existing_result jsonb;
  v_current_updated_at timestamptz;
  v_action_id text := nullif(btrim(coalesce(p_action_id, '')), '');
begin
  if v_action_id is not null then
    select id, result_payload
    into v_existing_history_id, v_existing_result
    from public.ai_event_edit_history
    where action_id = v_action_id
    limit 1;

    if found then
      return coalesce(
        v_existing_result,
        jsonb_build_object(
          'success', true,
          'event_id', coalesce(p_event_id, (select event_id from public.ai_event_edit_history where id = v_existing_history_id)),
          'action_id', v_action_id,
          'history_id', v_existing_history_id,
          'replayed', true
        )
      );
    end if;
  end if;

  select updated_at
  into v_current_updated_at
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Event not found';
  end if;

  if p_expected_updated_at is not null and v_current_updated_at is distinct from p_expected_updated_at then
    raise exception 'This event changed since the AI suggestion was prepared. Refresh the event details and try again.';
  end if;

  v_before := public.ai_build_event_snapshot(p_event_id);

  update public.events
  set
    title = case when p_event_updates ? 'title' then nullif(btrim(p_event_updates->>'title'), '') else title end,
    start_time = case when p_event_updates ? 'start_time' then (p_event_updates->>'start_time')::timestamptz else start_time end,
    end_time = case when p_event_updates ? 'end_time' then (p_event_updates->>'end_time')::timestamptz else end_time end,
    location_name = case when p_event_updates ? 'location_name' then nullif(btrim(p_event_updates->>'location_name'), '') else location_name end,
    address = case when p_event_updates ? 'address' then nullif(btrim(p_event_updates->>'address'), '') else address end,
    description = case when p_event_updates ? 'description' then nullif(btrim(p_event_updates->>'description'), '') else description end,
    all_day = case when p_event_updates ? 'all_day' then (p_event_updates->>'all_day')::boolean else all_day end,
    is_enriched = case when p_event_updates ? 'is_enriched' then (p_event_updates->>'is_enriched')::boolean else is_enriched end,
    updated_at = v_now
  where id = p_event_id;

  if p_enrichment_updates <> '{}'::jsonb then
    insert into public.event_enrichments (
      event_id,
      confidence,
      what_to_bring,
      prep_notes,
      category,
      outfit_suggestion,
      parking_notes,
      contact_name,
      contact_phone,
      cost_estimate,
      dietary_notes,
      meal_impact,
      created_at,
      updated_at
    )
    values (
      p_event_id,
      'low',
      case
        when p_enrichment_updates ? 'what_to_bring'
          then array(select jsonb_array_elements_text(p_enrichment_updates->'what_to_bring'))
        else array[]::text[]
      end,
      case when p_enrichment_updates ? 'prep_notes' then nullif(btrim(p_enrichment_updates->>'prep_notes'), '') else null end,
      case when p_enrichment_updates ? 'category' then nullif(btrim(p_enrichment_updates->>'category'), '') else null end,
      case when p_enrichment_updates ? 'outfit_suggestion' then nullif(btrim(p_enrichment_updates->>'outfit_suggestion'), '') else null end,
      case when p_enrichment_updates ? 'parking_notes' then nullif(btrim(p_enrichment_updates->>'parking_notes'), '') else null end,
      case when p_enrichment_updates ? 'contact_name' then nullif(btrim(p_enrichment_updates->>'contact_name'), '') else null end,
      case when p_enrichment_updates ? 'contact_phone' then nullif(btrim(p_enrichment_updates->>'contact_phone'), '') else null end,
      case when p_enrichment_updates ? 'cost_estimate' then nullif(btrim(p_enrichment_updates->>'cost_estimate'), '') else null end,
      case when p_enrichment_updates ? 'dietary_notes' then nullif(btrim(p_enrichment_updates->>'dietary_notes'), '') else null end,
      case when p_enrichment_updates ? 'meal_impact' then nullif(btrim(p_enrichment_updates->>'meal_impact'), '') else null end,
      v_now,
      v_now
    )
    on conflict (event_id) do update set
      what_to_bring = case when p_enrichment_updates ? 'what_to_bring' then excluded.what_to_bring else public.event_enrichments.what_to_bring end,
      prep_notes = case when p_enrichment_updates ? 'prep_notes' then excluded.prep_notes else public.event_enrichments.prep_notes end,
      category = case when p_enrichment_updates ? 'category' then excluded.category else public.event_enrichments.category end,
      outfit_suggestion = case when p_enrichment_updates ? 'outfit_suggestion' then excluded.outfit_suggestion else public.event_enrichments.outfit_suggestion end,
      parking_notes = case when p_enrichment_updates ? 'parking_notes' then excluded.parking_notes else public.event_enrichments.parking_notes end,
      contact_name = case when p_enrichment_updates ? 'contact_name' then excluded.contact_name else public.event_enrichments.contact_name end,
      contact_phone = case when p_enrichment_updates ? 'contact_phone' then excluded.contact_phone else public.event_enrichments.contact_phone end,
      cost_estimate = case when p_enrichment_updates ? 'cost_estimate' then excluded.cost_estimate else public.event_enrichments.cost_estimate end,
      dietary_notes = case when p_enrichment_updates ? 'dietary_notes' then excluded.dietary_notes else public.event_enrichments.dietary_notes end,
      meal_impact = case when p_enrichment_updates ? 'meal_impact' then excluded.meal_impact else public.event_enrichments.meal_impact end,
      updated_at = v_now;
  end if;

  if p_checklist_items is not null then
    delete from public.event_checklist_items where event_id = p_event_id;
    if jsonb_typeof(p_checklist_items) = 'array' then
      v_index := 0;
      for v_item in select value from jsonb_array_elements(p_checklist_items)
      loop
        if nullif(btrim(v_item->>'label'), '') is not null then
          insert into public.event_checklist_items (
            id, event_id, label, note, checked, category, sort_order
          )
          values (
            coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid()),
            p_event_id,
            btrim(v_item->>'label'),
            nullif(btrim(v_item->>'note'), ''),
            coalesce((v_item->>'checked')::boolean, false),
            nullif(btrim(v_item->>'category'), ''),
            v_index
          );
          v_index := v_index + 1;
        end if;
      end loop;
    end if;
  end if;

  if p_action_items is not null then
    delete from public.event_action_items where event_id = p_event_id;
    if jsonb_typeof(p_action_items) = 'array' then
      for v_item in select value from jsonb_array_elements(p_action_items)
      loop
        if nullif(btrim(v_item->>'title'), '') is not null then
          insert into public.event_action_items (
            id, event_id, title, description, due_date, is_urgent, completed, completed_at, assigned_to
          )
          values (
            coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid()),
            p_event_id,
            btrim(v_item->>'title'),
            nullif(btrim(v_item->>'description'), ''),
            case when nullif(btrim(v_item->>'due_date'), '') is not null then (v_item->>'due_date')::timestamptz else null end,
            coalesce((v_item->>'is_urgent')::boolean, false),
            coalesce((v_item->>'completed')::boolean, false),
            case
              when coalesce((v_item->>'completed')::boolean, false) then coalesce(nullif(v_item->>'completed_at', '')::timestamptz, v_now)
              else null
            end,
            nullif(btrim(v_item->>'assigned_to'), '')
          );
        end if;
      end loop;
    end if;
  end if;

  if array_length(p_members_add, 1) is not null then
    insert into public.event_members (event_id, family_member_id, role, rsvp_status)
    select p_event_id, member_id, 'attendee', 'accepted'
    from unnest(p_members_add) as member_id
    on conflict (event_id, family_member_id) do nothing;
  end if;

  if array_length(p_members_remove, 1) is not null then
    delete from public.event_members
    where event_id = p_event_id
      and family_member_id = any(p_members_remove);
  end if;

  v_after := public.ai_build_event_snapshot(p_event_id);

  if v_action_id is not null then
    insert into public.ai_event_edit_history (
      action_id,
      event_id,
      tool,
      ai_session_id,
      confirmed_by_user,
      request_payload,
      before_state,
      after_state,
      status,
      sync_status,
      result_payload,
      applied_at
    )
    values (
      v_action_id,
      p_event_id,
      'update_event',
      p_ai_session_id,
      true,
      coalesce(p_request_payload, '{}'::jsonb),
      v_before,
      v_after,
      'applied',
      'not_needed',
      jsonb_build_object(
        'success', true,
        'event_id', p_event_id,
        'action_id', v_action_id
      ),
      v_now
    )
    returning id into v_history_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'action_id', v_action_id,
    'history_id', v_history_id,
    'event_updated_at', v_after #>> '{event,updated_at}'
  );
end;
$$;

create or replace function public.ai_revert_event_edit(
  p_action_id text,
  p_undo_action_id text,
  p_ai_session_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_original public.ai_event_edit_history%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_history_id uuid;
  v_existing_result jsonb;
  v_current_updated_at timestamptz;
  v_expected_after_updated_at timestamptz;
begin
  select result_payload
  into v_existing_result
  from public.ai_event_edit_history
  where action_id = p_undo_action_id
  limit 1;

  if found then
    return coalesce(
      v_existing_result,
      jsonb_build_object(
        'success', true,
        'action_id', p_undo_action_id
      )
    );
  end if;

  select *
  into v_original
  from public.ai_event_edit_history
  where action_id = p_action_id
    and tool = 'update_event'
  limit 1;

  if not found then
    raise exception 'Original AI edit not found';
  end if;

  if v_original.undone_at is not null then
    raise exception 'This AI edit was already undone';
  end if;

  select updated_at
  into v_current_updated_at
  from public.events
  where id = v_original.event_id
  for update;

  if not found then
    raise exception 'Event not found';
  end if;

  v_expected_after_updated_at := nullif(v_original.after_state #>> '{event,updated_at}', '')::timestamptz;
  if v_expected_after_updated_at is not null and v_current_updated_at is distinct from v_expected_after_updated_at then
    raise exception 'This event changed after the AI edit, so automatic undo is no longer safe.';
  end if;

  v_before := public.ai_build_event_snapshot(v_original.event_id);
  perform public.ai_restore_event_snapshot(v_original.event_id, v_original.before_state);
  v_after := public.ai_build_event_snapshot(v_original.event_id);

  insert into public.ai_event_edit_history (
    action_id,
    event_id,
    tool,
    ai_session_id,
    confirmed_by_user,
    request_payload,
    before_state,
    after_state,
    status,
    sync_status,
    result_payload,
    reverted_history_id,
    applied_at
  )
  values (
    p_undo_action_id,
    v_original.event_id,
    'undo_event_edit',
    p_ai_session_id,
    true,
    jsonb_build_object('target_action_id', p_action_id),
    v_before,
    v_after,
    'applied',
    'not_needed',
    jsonb_build_object(
      'success', true,
      'event_id', v_original.event_id,
      'action_id', p_undo_action_id,
      'undid_action_id', p_action_id
    ),
    v_original.id,
    v_now
  )
  returning id into v_history_id;

  update public.ai_event_edit_history
  set undone_at = v_now, undone_by_history_id = v_history_id
  where id = v_original.id;

  return jsonb_build_object(
    'success', true,
    'event_id', v_original.event_id,
    'action_id', p_undo_action_id,
    'history_id', v_history_id,
    'undid_action_id', p_action_id,
    'event_updated_at', v_after #>> '{event,updated_at}'
  );
end;
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
  if p_audit_history_id is not null then
    select id
    into v_job_id
    from public.google_sync_jobs
    where audit_history_id = p_audit_history_id
      and status in ('pending', 'retrying', 'running')
    order by created_at desc
    limit 1;

    if found then
      return v_job_id;
    end if;
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
