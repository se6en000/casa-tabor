insert into public.event_checklist_items (
  event_id,
  label,
  checked,
  sort_order
)
select
  enrichment.event_id,
  btrim(item.label),
  false,
  item.ordinality - 1
from public.event_enrichments enrichment
cross join lateral unnest(enrichment.what_to_bring) with ordinality as item(label, ordinality)
where btrim(item.label) <> ''
  and not exists (
    select 1
    from public.event_checklist_items existing
    where existing.event_id = enrichment.event_id
  );

create or replace function public.sync_event_checklist_legacy_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid := coalesce(new.event_id, old.event_id);
  v_labels text[];
begin
  if not exists (
    select 1
    from public.events
    where id = v_event_id
  ) then
    return null;
  end if;

  select coalesce(
    array_agg(label order by sort_order, created_at, id),
    array[]::text[]
  )
  into v_labels
  from public.event_checklist_items
  where event_id = v_event_id;

  insert into public.event_enrichments (
    event_id,
    confidence,
    what_to_bring,
    created_at,
    updated_at
  )
  values (
    v_event_id,
    'low',
    v_labels,
    now(),
    now()
  )
  on conflict (event_id) do update set
    what_to_bring = v_labels,
    updated_at = now();

  return null;
end;
$$;

drop trigger if exists sync_event_checklist_legacy_projection
  on public.event_checklist_items;

create trigger sync_event_checklist_legacy_projection
after insert or update or delete on public.event_checklist_items
for each row execute function public.sync_event_checklist_legacy_projection();

create or replace function public.seed_event_checklist_if_empty(
  p_event_id uuid,
  p_labels jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer := 0;
begin
  if p_event_id is null or jsonb_typeof(p_labels) <> 'array' then
    return 0;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text, 0));

  insert into public.event_checklist_items (
    event_id,
    label,
    checked,
    sort_order
  )
  select
    p_event_id,
    btrim(item.label),
    false,
    item.ordinality - 1
  from jsonb_array_elements_text(p_labels) with ordinality as item(label, ordinality)
  where btrim(item.label) <> ''
    and not exists (
      select 1
      from public.event_checklist_items existing
      where existing.event_id = p_event_id
    );

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.seed_event_checklist_if_empty(uuid, jsonb) from public;
grant execute on function public.seed_event_checklist_if_empty(uuid, jsonb) to service_role;

insert into public.event_enrichments (
  event_id,
  confidence,
  what_to_bring,
  created_at,
  updated_at
)
with canonical as (
  select
    event_id,
    array_agg(label order by sort_order, created_at, id) as labels
  from public.event_checklist_items
  group by event_id
)
select
  event_id,
  'low',
  labels,
  now(),
  now()
from canonical
on conflict (event_id) do update set
  what_to_bring = excluded.what_to_bring,
  updated_at = now()
where event_enrichments.what_to_bring is distinct from excluded.what_to_bring;
