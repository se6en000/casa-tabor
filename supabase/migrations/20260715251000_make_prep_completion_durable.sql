alter table public.prep_items
  add column if not exists action_key text;

create or replace function public.prep_item_action_key(
  p_id uuid,
  p_event_id uuid,
  p_type text,
  p_source_type text,
  p_source_ref text
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_source_type in ('reminder_manual', 'reminder_missed')
      and nullif(btrim(p_source_ref), '') is not null
      then 'reminder:' || btrim(p_source_ref) || ':reminder'
    when nullif(btrim(p_source_ref), '') is not null
      then coalesce(nullif(btrim(p_source_type), ''), 'source')
        || ':' || btrim(p_source_ref)
        || ':' || lower(coalesce(nullif(btrim(p_type), ''), 'general'))
    when p_event_id is not null
      then 'event:' || p_event_id::text
        || ':' || lower(coalesce(nullif(btrim(p_type), ''), 'general'))
    else 'item:' || p_id::text
  end;
$$;

revoke all on function public.prep_item_action_key(uuid, uuid, text, text, text)
  from public, anon, authenticated;

update public.prep_items item
set action_key = public.prep_item_action_key(
  item.id,
  item.event_id,
  item.type,
  item.source_type,
  item.source_ref
)
where item.action_key is null;

with duplicates as (
  select
    item.id,
    row_number() over (
      partition by item.action_key
      order by item.created_at, item.id
    ) as active_position
  from public.prep_items item
  where item.dismissed = false
)
update public.prep_items item
set
  dismissed = true,
  dismissed_at = coalesce(item.dismissed_at, now())
from duplicates
where item.id = duplicates.id
  and duplicates.active_position > 1;

alter table public.prep_items
  alter column action_key set not null;

create unique index if not exists prep_items_one_active_action_key
  on public.prep_items (action_key)
  where dismissed = false;

create table if not exists public.prep_item_resolutions (
  action_key text primary key,
  prep_item_id uuid references public.prep_items(id) on delete set null,
  outcome text not null check (outcome in ('done', 'dismissed', 'not_relevant')),
  source_type text,
  source_ref text,
  event_id uuid references public.events(id) on delete set null,
  action_type text not null,
  resolved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.prep_item_resolutions enable row level security;
revoke all on table public.prep_item_resolutions from anon, authenticated;

create or replace function public.enforce_prep_item_action_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.action_key := public.prep_item_action_key(
    new.id,
    new.event_id,
    new.type,
    new.source_type,
    new.source_ref
  );

  if new.dismissed = false and exists (
    select 1
    from public.prep_item_resolutions resolution
    where resolution.action_key = new.action_key
  ) then
    if tg_op = 'INSERT' then return null; end if;
    new.dismissed := true;
    new.dismissed_at := coalesce(new.dismissed_at, now());
  end if;

  if tg_op = 'INSERT'
    and new.dismissed = false
    and exists (
      select 1
      from public.prep_items existing
      where existing.action_key = new.action_key
        and existing.dismissed = false
    )
  then
    return null;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_prep_item_action_identity()
  from public, anon, authenticated;

drop trigger if exists enforce_prep_item_action_identity on public.prep_items;
create trigger enforce_prep_item_action_identity
before insert or update of event_id, type, source_type, source_ref, dismissed
on public.prep_items
for each row execute function public.enforce_prep_item_action_identity();

create or replace function public.resolve_prep_item(
  p_prep_item_id uuid,
  p_outcome text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.prep_items%rowtype;
  normalized_outcome text := lower(btrim(p_outcome));
  linked_reminder_id uuid;
  reminder_completed boolean := false;
  resolved_count integer := 0;
begin
  if normalized_outcome not in ('done', 'dismissed', 'not_relevant') then
    raise exception 'Unsupported prep item outcome: %', p_outcome;
  end if;

  select *
  into item
  from public.prep_items
  where id = p_prep_item_id
  for update;

  if not found then
    raise exception 'Prep item not found';
  end if;

  item.action_key := public.prep_item_action_key(
    item.id,
    item.event_id,
    item.type,
    item.source_type,
    item.source_ref
  );

  if normalized_outcome = 'done'
    and item.source_type in ('reminder_manual', 'reminder_missed')
    and item.source_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    linked_reminder_id := item.source_ref::uuid;

    update public.events event
    set
      status = 'cancelled',
      updated_at = now()
    where event.id = linked_reminder_id
      and event.event_type = 'reminder'
      and event.status <> 'cancelled';

    reminder_completed := found;
  end if;

  insert into public.prep_item_resolutions (
    action_key,
    prep_item_id,
    outcome,
    source_type,
    source_ref,
    event_id,
    action_type,
    resolved_at
  )
  values (
    item.action_key,
    item.id,
    normalized_outcome,
    item.source_type,
    item.source_ref,
    item.event_id,
    item.type,
    now()
  )
  on conflict (action_key) do update
  set
    prep_item_id = excluded.prep_item_id,
    outcome = case
      when prep_item_resolutions.outcome = 'done' then 'done'
      else excluded.outcome
    end,
    resolved_at = excluded.resolved_at;

  update public.prep_items related
  set
    dismissed = true,
    dismissed_at = coalesce(related.dismissed_at, now())
  where related.action_key = item.action_key
    and related.dismissed = false;

  get diagnostics resolved_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'action_key', item.action_key,
    'outcome', normalized_outcome,
    'resolved_count', resolved_count,
    'reminder_completed', reminder_completed,
    'reminder_id', linked_reminder_id
  );
end;
$$;

revoke all on function public.resolve_prep_item(uuid, text)
  from public, anon, authenticated;
grant execute on function public.resolve_prep_item(uuid, text)
  to anon, authenticated, service_role;

do $$
declare
  active_item_id uuid;
begin
  select item.id
  into active_item_id
  from public.prep_items item
  where item.dismissed = false
    and item.source_type = 'reminder_missed'
    and item.source_ref = 'e1f846b9-588b-4d34-93e8-38700347b85b'
    and item.event_title = 'Order Family Groceries'
  order by item.created_at desc
  limit 1;

  if active_item_id is not null then
    perform public.resolve_prep_item(active_item_id, 'done');
  end if;
end;
$$;
