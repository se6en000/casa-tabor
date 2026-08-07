create or replace function public.queue_family_data_projection(
  p_source_type text,
  p_source_id text,
  p_operation text default 'upsert'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_source_id is null or p_source_id = '' then
    return;
  end if;

  insert into public.family_data_index_queue (
    source_type,
    source_id,
    operation,
    status,
    attempts,
    available_at,
    locked_at,
    locked_by,
    last_error
  ) values (
    p_source_type,
    p_source_id,
    p_operation,
    'pending',
    0,
    now(),
    null,
    null,
    null
  )
  on conflict (source_type, source_id) do update set
    operation = excluded.operation,
    status = 'pending',
    attempts = 0,
    available_at = now(),
    locked_at = null,
    locked_by = null,
    last_error = null,
    updated_at = now();
end;
$$;

revoke all on function public.queue_family_data_projection(text, text, text) from public;
grant execute on function public.queue_family_data_projection(text, text, text) to service_role;

create or replace function public.enqueue_family_event_projection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_source_type text;
  new_source_type text;
begin
  if tg_op = 'DELETE' then
    old_source_type := case when old.event_type = 'reminder' then 'reminder' else 'event' end;
    perform public.queue_family_data_projection(old_source_type, old.id::text, 'delete');
    return old;
  end if;

  new_source_type := case when new.event_type = 'reminder' then 'reminder' else 'event' end;
  if tg_op = 'UPDATE' and old.event_type is distinct from new.event_type then
    old_source_type := case when old.event_type = 'reminder' then 'reminder' else 'event' end;
    perform public.queue_family_data_projection(old_source_type, old.id::text, 'delete');
  end if;
  perform public.queue_family_data_projection(new_source_type, new.id::text, 'upsert');
  return new;
end;
$$;

create or replace function public.enqueue_family_event_child_projection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_event_id uuid;
  source_event_type text;
begin
  if tg_op = 'DELETE' then
    source_event_id := old.event_id;
  else
    source_event_id := new.event_id;
  end if;
  select case when event_type = 'reminder' then 'reminder' else 'event' end
  into source_event_type
  from public.events
  where id = source_event_id;

  if source_event_type is not null then
    perform public.queue_family_data_projection(source_event_type, source_event_id::text, 'upsert');
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.enqueue_family_generic_projection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_id text;
  source_id text;
  operation text;
begin
  if tg_op = 'DELETE' then
    row_id := to_jsonb(old)->>'id';
  else
    row_id := to_jsonb(new)->>'id';
  end if;
  source_id := coalesce(tg_argv[1], '') || row_id;
  operation := case when tg_op = 'DELETE' then 'delete' else 'upsert' end;
  perform public.queue_family_data_projection(tg_argv[0], source_id, operation);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists family_data_project_events on public.events;
create trigger family_data_project_events
after insert or update or delete on public.events
for each row execute function public.enqueue_family_event_projection();

drop trigger if exists family_data_project_event_enrichments on public.event_enrichments;
create trigger family_data_project_event_enrichments
after insert or update or delete on public.event_enrichments
for each row execute function public.enqueue_family_event_child_projection();

drop trigger if exists family_data_project_event_members on public.event_members;
create trigger family_data_project_event_members
after insert or update or delete on public.event_members
for each row execute function public.enqueue_family_event_child_projection();

drop trigger if exists family_data_project_event_checklist_items on public.event_checklist_items;
create trigger family_data_project_event_checklist_items
after insert or update or delete on public.event_checklist_items
for each row execute function public.enqueue_family_event_child_projection();

drop trigger if exists family_data_project_event_action_items on public.event_action_items;
create trigger family_data_project_event_action_items
after insert or update or delete on public.event_action_items
for each row execute function public.enqueue_family_event_child_projection();

drop trigger if exists family_data_project_prep_items on public.prep_items;
create trigger family_data_project_prep_items
after insert or update or delete on public.prep_items
for each row execute function public.enqueue_family_generic_projection('prep', '');

drop trigger if exists family_data_project_notifications on public.notifications;
create trigger family_data_project_notifications
after insert or update or delete on public.notifications
for each row execute function public.enqueue_family_generic_projection('activity', '');

drop trigger if exists family_data_project_saved_contacts on public.saved_contacts;
create trigger family_data_project_saved_contacts
after insert or update or delete on public.saved_contacts
for each row execute function public.enqueue_family_generic_projection('person', '');

drop trigger if exists family_data_project_saved_places on public.saved_places;
create trigger family_data_project_saved_places
after insert or update or delete on public.saved_places
for each row execute function public.enqueue_family_generic_projection('place', '');

drop trigger if exists family_data_project_family_contact_relationships on public.family_contact_relationships;
create trigger family_data_project_family_contact_relationships
after insert or update or delete on public.family_contact_relationships
for each row execute function public.enqueue_family_generic_projection('relationship', 'family_contact:');

drop trigger if exists family_data_project_contact_place_relationships on public.contact_place_relationships;
create trigger family_data_project_contact_place_relationships
after insert or update or delete on public.contact_place_relationships
for each row execute function public.enqueue_family_generic_projection('relationship', 'contact_place:');

drop trigger if exists family_data_project_ai_memory_observations on public.ai_memory_observations;
create trigger family_data_project_ai_memory_observations
after insert or update or delete on public.ai_memory_observations
for each row execute function public.enqueue_family_generic_projection('memory', '');

insert into public.family_data_index_queue (source_type, source_id, operation, status)
select
  case when event_type = 'reminder' then 'reminder' else 'event' end,
  id::text,
  'upsert',
  'pending'
from public.events
where status <> 'cancelled'
on conflict (source_type, source_id) do update set
  operation = 'upsert',
  status = 'pending',
  available_at = now(),
  updated_at = now();

insert into public.family_data_index_queue (source_type, source_id, operation, status)
select 'prep', id::text, 'upsert', 'pending'
from public.prep_items
where coalesce(dismissed, false) = false
on conflict (source_type, source_id) do update set
  operation = 'upsert',
  status = 'pending',
  available_at = now(),
  updated_at = now();

insert into public.family_data_index_queue (source_type, source_id, operation, status)
select 'memory', id::text, 'upsert', 'pending'
from public.ai_memory_observations
where status = 'active'
on conflict (source_type, source_id) do update set
  operation = 'upsert',
  status = 'pending',
  available_at = now(),
  updated_at = now();

insert into public.family_data_index_queue (source_type, source_id, operation, status)
select 'activity', id::text, 'upsert', 'pending'
from public.notifications
where created_at >= now() - interval '30 days'
on conflict (source_type, source_id) do update set
  operation = 'upsert',
  status = 'pending',
  available_at = now(),
  updated_at = now();

insert into public.family_data_index_queue (source_type, source_id, operation, status)
select 'person', id::text, 'upsert', 'pending'
from public.saved_contacts
where confirmed = true and dismissed_at is null
on conflict (source_type, source_id) do update set
  operation = 'upsert',
  status = 'pending',
  available_at = now(),
  updated_at = now();

insert into public.family_data_index_queue (source_type, source_id, operation, status)
select 'place', id::text, 'upsert', 'pending'
from public.saved_places
where confirmed = true and dismissed_at is null
on conflict (source_type, source_id) do update set
  operation = 'upsert',
  status = 'pending',
  available_at = now(),
  updated_at = now();

insert into public.family_data_index_queue (source_type, source_id, operation, status)
select 'relationship', 'family_contact:' || id::text, 'upsert', 'pending'
from public.family_contact_relationships
where confirmed = true and dismissed_at is null
on conflict (source_type, source_id) do update set
  operation = 'upsert',
  status = 'pending',
  available_at = now(),
  updated_at = now();

insert into public.family_data_index_queue (source_type, source_id, operation, status)
select 'relationship', 'contact_place:' || id::text, 'upsert', 'pending'
from public.contact_place_relationships
where confirmed = true and dismissed_at is null
on conflict (source_type, source_id) do update set
  operation = 'upsert',
  status = 'pending',
  available_at = now(),
  updated_at = now();

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'process-family-data-index'
  limit 1;
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end;
$$;

select cron.schedule(
  'process-family-data-index',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/index-family-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'SUPABASE_SERVICE_ROLE_KEY'
        limit 1
      )
    ),
    body := '{"batch_size": 25}'::jsonb
  );
  $$
);

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'purge-expired-family-email-evidence'
  limit 1;
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end;
$$;

select cron.schedule(
  'purge-expired-family-email-evidence',
  '15 3 * * *',
  $$select public.purge_expired_family_email_evidence(interval '4 months');$$
);
