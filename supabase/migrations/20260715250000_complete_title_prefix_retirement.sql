alter table public.google_sync_jobs
  add column if not exists sync_mode text not null default 'full';

create temporary table missing_title_retirement_instances on commit drop as
with retirement as (
  select min(operation.created_at) as applied_at
  from public.calendar_sync_operations operation
  where operation.action_id like 'event-title-prefix-retirement:%'
)
select event.id, event.series_id
from public.events event
cross join retirement
where retirement.applied_at is not null
  and event.updated_at = retirement.applied_at
  and event.record_kind = 'occurrence'
  and coalesce(event.exception_paths, '[]'::jsonb) ? 'event.title'
  and event.status = 'confirmed'
  and event.deleted_at is null
  and event.google_event_id is not null
  and not exists (
    select 1
    from public.calendar_sync_operations operation
    where operation.action_id = 'event-title-prefix-retirement:occurrence:' || event.id::text
      and operation.operation_key = 'this:update'
  );

do $$
declare
  missing_count integer;
begin
  select count(*) into missing_count
  from missing_title_retirement_instances;

  if missing_count not in (0, 44) then
    raise exception
      'Expected either 0 or 44 missing title-retirement instances, found %',
      missing_count;
  end if;
end;
$$;

create temporary table missing_title_series_revisions on commit drop as
with bumped as (
  update public.event_series series
  set
    revision = series.revision + 1,
    updated_at = now()
  where series.status = 'active'
    and exists (
      select 1
      from missing_title_retirement_instances target
      where target.series_id = series.id
    )
  returning
    series.id,
    series.revision,
    series.source_connection_id
)
select * from bumped;

insert into public.calendar_sync_operations (
  action_id,
  operation_key,
  series_id,
  event_id,
  connection_id,
  operation_type,
  casa_revision,
  payload_snapshot,
  correlation_id
)
select
  'event-title-prefix-retirement:occurrence:' || event.id::text,
  'this:update',
  event.series_id,
  event.id,
  series.source_connection_id,
  'patch_instance',
  series.revision,
  jsonb_build_object(
    'scope', 'this',
    'mutation_type', 'update',
    'changed_paths', jsonb_build_array('event.title')
  ),
  'event-title-prefix-retirement:occurrence:' || event.id::text
from missing_title_retirement_instances target
join public.events event on event.id = target.id
join missing_title_series_revisions series on series.id = event.series_id
where series.source_connection_id is not null
  and coalesce((
    select (setting.value->>'google_sync_v2')::boolean
    from public.settings setting
    where setting.key = 'recurrence_v2_flags'
  ), false)
on conflict (action_id, operation_key) do nothing;

create temporary table residual_pipe_title_cleanup (
  event_id uuid primary key,
  previous_title text not null,
  clean_title text not null
) on commit drop;

insert into residual_pipe_title_cleanup (event_id, previous_title, clean_title)
values
  ('1e401ba6-5084-4da9-826e-97d010337deb', 'Jake & Giselle | Myrtle Beach Family Trip', 'Myrtle Beach Family Trip'),
  ('ad27a5c5-c3c2-4874-a290-2ab86501a153', 'Mary | Watch Owen', 'Mary Watches Owen'),
  ('32b97dec-c006-49c5-a6a4-a44a147d66b0', 'Milo | Grooming Appointment', 'Milo Grooming Appointment'),
  ('8cd91a0a-ba92-4cb9-83ce-e5a8e87f5624', 'Softball Practice | Glen', 'Softball Practice With Glen'),
  ('e13754b4-821c-429f-855b-f95922bddae3', 'Ayla | Birthday!!', 'Ayla Birthday!!'),
  ('74f103e2-de50-4576-8151-260c85824a2e', 'Field Trip Lox | Mel Taking', 'Field Trip Lox - Mel Taking');

update public.events event
set
  title = cleanup.clean_title,
  updated_at = now()
from residual_pipe_title_cleanup cleanup
where event.id = cleanup.event_id
  and event.title = cleanup.previous_title;

insert into public.google_sync_jobs (
  event_id,
  status,
  last_error,
  next_retry_at,
  updated_at,
  sync_mode
)
select
  event.id,
  'pending',
  'Residual event title pipe formatting retired.',
  now(),
  now(),
  'title_only'
from residual_pipe_title_cleanup cleanup
join public.events event on event.id = cleanup.event_id
where event.title = cleanup.clean_title
  and event.record_kind = 'single'
  and event.event_type <> 'reminder'
  and event.status = 'confirmed'
  and event.deleted_at is null
  and event.google_event_id is not null
on conflict (event_id) where status in ('pending', 'retrying')
do update
set
  next_retry_at = now(),
  last_error = excluded.last_error,
  updated_at = now(),
  sync_mode = 'title_only';

update public.google_sync_jobs job
set
  status = 'retrying',
  attempts = 0,
  completed_at = null,
  next_retry_at = now(),
  last_error = 'Retrying title-only projection after full-event payload rejection.',
  updated_at = now(),
  worker_id = null,
  sync_mode = 'title_only'
where job.status = 'failed'
  and job.created_at = (
    select min(operation.created_at)
    from public.calendar_sync_operations operation
    where operation.action_id like 'event-title-prefix-retirement:%'
  );
