create or replace function public.normalize_event_title_person_prefix(p_title text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  separator_position integer;
  candidate_prefix text;
  candidate_title text;
begin
  if p_title is null then return null; end if;
  separator_position := strpos(p_title, ' | ');
  if separator_position = 0 then return p_title; end if;

  candidate_prefix := btrim(substr(p_title, 1, separator_position - 1));
  candidate_title := btrim(substr(p_title, separator_position + 3));
  if candidate_title = '' then return p_title; end if;

  if exists (
    select 1
    from public.family_members member
    where lower(candidate_prefix) = lower(member.name)
      or (
        member.full_name is not null
        and lower(candidate_prefix) = lower(member.full_name)
      )
  ) then
    return candidate_title;
  end if;

  return p_title;
end;
$$;

revoke all on function public.normalize_event_title_person_prefix(text)
  from public, anon, authenticated;

create or replace function public.enforce_event_title_without_person_prefix()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.title := public.normalize_event_title_person_prefix(new.title);
  return new;
end;
$$;

revoke all on function public.enforce_event_title_without_person_prefix()
  from public, anon, authenticated;

drop trigger if exists enforce_event_title_without_person_prefix on public.events;
create trigger enforce_event_title_without_person_prefix
before insert or update of title on public.events
for each row execute function public.enforce_event_title_without_person_prefix();

alter table public.google_sync_jobs
  add column if not exists sync_mode text not null default 'full';

create temporary table legacy_person_title_targets on commit drop as
with parsed as (
  select
    event.id,
    event.record_kind,
    event.series_id,
    event.title as previous_title,
    btrim(split_part(event.title, ' | ', 1)) as prefix,
    regexp_replace(
      case
        when lower(btrim(split_part(event.title, ' | ', 1))) in ('jacob', 'caden')
          then btrim(substr(event.title, strpos(event.title, ' | ') + 3))
        else public.normalize_event_title_person_prefix(event.title)
      end,
      E'([a-z])([''’])S\\y',
      E'\\1\\2s',
      'g'
    ) as clean_title
  from public.events event
  where strpos(event.title, ' | ') > 0
)
select parsed.*
from parsed
where parsed.clean_title <> ''
  and (
    parsed.clean_title <> parsed.previous_title
    or lower(parsed.prefix) in ('jacob', 'caden')
  );

create unique index legacy_person_title_targets_id_idx
  on legacy_person_title_targets (id);

create temporary table legacy_title_series_revisions on commit drop as
with affected as (
  select
    series.id,
    bool_or(target.id = series.template_event_id) as template_title_changed
  from public.event_series series
  join legacy_person_title_targets target
    on target.id = series.template_event_id
    or target.series_id = series.id
  where series.status = 'active'
  group by series.id
),
bumped as (
  update public.event_series series
  set
    revision = series.revision + 1,
    updated_at = now()
  from affected
  where series.id = affected.id
  returning
    series.id,
    series.revision,
    series.source_connection_id
)
select
  bumped.*,
  affected.template_title_changed
from bumped
join affected on affected.id = bumped.id;

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
  'event-title-prefix-retirement:series:' || series.id::text,
  'all:update',
  series.id,
  null,
  series.source_connection_id,
  'patch_master',
  series.revision,
  jsonb_build_object('scope', 'all', 'mutation_type', 'update', 'changed_paths', jsonb_build_array('event.title')),
  'event-title-prefix-retirement:series:' || series.id::text
from legacy_title_series_revisions series
where series.source_connection_id is not null
  and series.template_title_changed
  and coalesce((
    select (setting.value->>'google_sync_v2')::boolean
    from public.settings setting
    where setting.key = 'recurrence_v2_flags'
  ), false)
on conflict (action_id, operation_key) do nothing;

update public.events event
set
  title = target.clean_title,
  updated_at = now()
from legacy_person_title_targets target
where event.id = target.id
  and event.title is distinct from target.clean_title;

insert into public.calendar_sync_operations (
  action_id,
  operation_key,
  series_id,
  event_id,
  connection_id,
  operation_type,
  casa_revision,
  payload_snapshot,
  depends_on_operation_id,
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
  jsonb_build_object('scope', 'this', 'mutation_type', 'update', 'changed_paths', jsonb_build_array('event.title')),
  master_operation.id,
  'event-title-prefix-retirement:occurrence:' || event.id::text
from legacy_person_title_targets target
join public.events event on event.id = target.id
join legacy_title_series_revisions series on series.id = event.series_id
left join public.calendar_sync_operations master_operation
  on master_operation.action_id = 'event-title-prefix-retirement:series:' || event.series_id::text
  and master_operation.operation_key = 'all:update'
where event.record_kind = 'occurrence'
  and coalesce(event.exception_paths, '[]'::jsonb) ? 'event.title'
  and event.status = 'confirmed'
  and event.deleted_at is null
  and event.google_event_id is not null
on conflict (action_id, operation_key) do nothing;

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
  'Event title person prefix retired.',
  now(),
  now(),
  'title_only'
from legacy_person_title_targets target
join public.events event on event.id = target.id
where event.record_kind = 'single'
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
