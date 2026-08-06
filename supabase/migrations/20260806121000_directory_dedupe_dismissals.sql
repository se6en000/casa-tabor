-- Lets users reject a suggested duplicate pair/group from the Settings
-- "Possible Duplicates" panel ("Not a duplicate") so it never resurfaces —
-- mirrors the dismissed_at tombstone pattern used for directory suggestions.
-- Needed because duplicate detection is necessarily heuristic (e.g. two
-- distinct real places can legitimately share a phone number, or bad alias
-- data from an earlier bug can wrongly link two unrelated names).

create table if not exists public.directory_dedupe_dismissals (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('place', 'contact', 'family_link', 'connection')),
  entity_a uuid not null,
  entity_b uuid not null,
  created_at timestamptz not null default now(),
  unique (kind, entity_a, entity_b)
);

alter table public.directory_dedupe_dismissals enable row level security;
create policy "allow all" on public.directory_dedupe_dismissals for all using (true) with check (true);

create or replace function public.dismiss_directory_duplicate(p_kind text, p_entity_a uuid, p_entity_b uuid)
returns void
language sql
as $$
  insert into public.directory_dedupe_dismissals (kind, entity_a, entity_b)
  values (p_kind, least(p_entity_a, p_entity_b), greatest(p_entity_a, p_entity_b))
  on conflict (kind, entity_a, entity_b) do nothing
$$;

create or replace function public.find_duplicate_place_pairs()
returns table(place_a uuid, place_b uuid, name_a text, name_b text, score numeric, reason text)
language sql
stable
as $$
  select a.id, b.id, a.name, b.name,
    greatest(
      case when a.name = any(b.aliases) or b.name = any(a.aliases) then 1.00 else 0 end,
      case when public.normalize_phone(a.phone) is not null
             and public.normalize_phone(a.phone) = public.normalize_phone(b.phone)
           then 0.95 else 0 end,
      case when a.name ilike b.name or b.name ilike a.name then 0.85 else 0 end,
      similarity(a.name, b.name)
    )::numeric as score,
    case
      when a.name = any(b.aliases) or b.name = any(a.aliases) then 'alias'
      when public.normalize_phone(a.phone) is not null
           and public.normalize_phone(a.phone) = public.normalize_phone(b.phone) then 'phone'
      when a.name ilike b.name or b.name ilike a.name then 'name_containment'
      else 'name_similarity'
    end as reason
  from public.saved_places a
  join public.saved_places b on a.id < b.id
  where a.dismissed_at is null and b.dismissed_at is null
    and (
      similarity(a.name, b.name) > 0.4
      or a.name ilike b.name or b.name ilike a.name
      or a.name = any(b.aliases) or b.name = any(a.aliases)
      or (public.normalize_phone(a.phone) is not null
          and public.normalize_phone(a.phone) = public.normalize_phone(b.phone))
    )
    and not exists (
      select 1 from public.directory_dedupe_dismissals d
      where d.kind = 'place' and d.entity_a = least(a.id, b.id) and d.entity_b = greatest(a.id, b.id)
    )
  order by score desc
$$;

create or replace function public.find_duplicate_contact_pairs()
returns table(contact_a uuid, contact_b uuid, name_a text, name_b text, score numeric, reason text)
language sql
stable
as $$
  select a.id, b.id, a.name, b.name,
    greatest(
      case when a.name = any(b.aliases) or b.name = any(a.aliases) then 1.00 else 0 end,
      case when public.normalize_phone(a.phone) is not null
             and public.normalize_phone(a.phone) = public.normalize_phone(b.phone)
           then 0.95 else 0 end,
      case when a.email is not null and b.email is not null
             and lower(trim(a.email)) = lower(trim(b.email)) and lower(trim(a.email)) <> ''
           then 0.95 else 0 end,
      case when a.name ilike b.name or b.name ilike a.name then 0.85 else 0 end,
      similarity(a.name, b.name)
    )::numeric as score,
    case
      when a.name = any(b.aliases) or b.name = any(a.aliases) then 'alias'
      when public.normalize_phone(a.phone) is not null
           and public.normalize_phone(a.phone) = public.normalize_phone(b.phone) then 'phone'
      when a.email is not null and b.email is not null
           and lower(trim(a.email)) = lower(trim(b.email)) and lower(trim(a.email)) <> '' then 'email'
      when a.name ilike b.name or b.name ilike a.name then 'name_containment'
      else 'name_similarity'
    end as reason
  from public.saved_contacts a
  join public.saved_contacts b on a.id < b.id
  where a.dismissed_at is null and b.dismissed_at is null
    and (
      similarity(a.name, b.name) > 0.4
      or a.name ilike b.name or b.name ilike a.name
      or a.name = any(b.aliases) or b.name = any(a.aliases)
      or (public.normalize_phone(a.phone) is not null
          and public.normalize_phone(a.phone) = public.normalize_phone(b.phone))
      or (a.email is not null and b.email is not null
          and lower(trim(a.email)) = lower(trim(b.email)) and lower(trim(a.email)) <> '')
    )
    and not exists (
      select 1 from public.directory_dedupe_dismissals d
      where d.kind = 'contact' and d.entity_a = least(a.id, b.id) and d.entity_b = greatest(a.id, b.id)
    )
  order by score desc
$$;

create or replace function public.find_duplicate_family_link_groups()
returns table(family_member_id uuid, contact_id uuid, relationship_ids uuid[], relationships text[])
language sql
stable
as $$
  select family_member_id, contact_id,
    array_agg(id order by confirmed desc, created_at),
    array_agg(relationship order by confirmed desc, created_at)
  from public.family_contact_relationships fcr
  where dismissed_at is null
    and not exists (
      select 1 from public.directory_dedupe_dismissals d
      where d.kind = 'family_link'
        and d.entity_a = least(fcr.family_member_id, fcr.contact_id)
        and d.entity_b = greatest(fcr.family_member_id, fcr.contact_id)
    )
  group by family_member_id, contact_id
  having count(*) > 1
$$;

create or replace function public.find_duplicate_connection_groups()
returns table(contact_id uuid, place_id uuid, relationship_ids uuid[], relationships text[])
language sql
stable
as $$
  select contact_id, place_id,
    array_agg(id order by confirmed desc, created_at),
    array_agg(relationship order by confirmed desc, created_at)
  from public.contact_place_relationships cpr
  where dismissed_at is null
    and not exists (
      select 1 from public.directory_dedupe_dismissals d
      where d.kind = 'connection'
        and d.entity_a = least(cpr.contact_id, cpr.place_id)
        and d.entity_b = greatest(cpr.contact_id, cpr.place_id)
    )
  group by contact_id, place_id
  having count(*) > 1
$$;

comment on table public.directory_dedupe_dismissals is
  'Tombstones for duplicate-pair suggestions the user rejected as "not a duplicate" so they never resurface in the Possible Duplicates panel.';
