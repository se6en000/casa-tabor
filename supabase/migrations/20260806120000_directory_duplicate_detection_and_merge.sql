-- Household directory: duplicate detection + safe merge tooling.
--
-- Problem: places/contacts can be created from several paths (manual add,
-- AI auto-create, discovery scan backfill) with no shared dedupe logic, so
-- the same real-world person/place ends up as multiple rows with slightly
-- different name spellings ("Dr. John S. Ledakis" / "John S. Ledakis, DDS,
-- PA" / "Dr. John S. Ledakis, DDS, PA"). These functions let the UI surface
-- likely-duplicate groups (across confirmed AND suggested rows) and merge
-- them safely, reassigning every relationship/reference to the surviving
-- row before deleting the losers.
--
-- Shared duplicate signal, strongest to weakest:
--   1. exact alias match           (score 1.00)
--   2. exact normalized phone/email match (score 0.95) — catches cases where
--      names differ wildly but it's clearly the same provider/place.
--   3. ILIKE containment (one name is a substring of the other, case-insens)
--      (score 0.85)
--   4. pg_trgm similarity() > 0.4  (score = similarity value)

create extension if not exists pg_trgm;

create or replace function public.normalize_phone(p text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '')
$$;

-- ── Single-record fuzzy lookup (used before creating a new place/contact) ──

create or replace function public.find_similar_places(
  p_name text,
  p_phone text default null,
  p_exclude_id uuid default null
) returns table(id uuid, name text, address text, phone text, confirmed boolean, score numeric, reason text)
language sql
stable
as $$
  select
    sp.id, sp.name, sp.address, sp.phone, sp.confirmed,
    greatest(
      case when p_name is not null and p_name = any(sp.aliases) then 1.00 else 0 end,
      case when public.normalize_phone(p_phone) is not null
             and public.normalize_phone(p_phone) = public.normalize_phone(sp.phone)
           then 0.95 else 0 end,
      case when p_name is not null and (sp.name ilike p_name or p_name ilike sp.name) then 0.85 else 0 end,
      case when p_name is not null then similarity(sp.name, p_name) else 0 end
    )::numeric as score,
    case
      when p_name is not null and p_name = any(sp.aliases) then 'alias'
      when public.normalize_phone(p_phone) is not null
           and public.normalize_phone(p_phone) = public.normalize_phone(sp.phone) then 'phone'
      when p_name is not null and (sp.name ilike p_name or p_name ilike sp.name) then 'name_containment'
      else 'name_similarity'
    end as reason
  from public.saved_places sp
  where sp.dismissed_at is null
    and (p_exclude_id is null or sp.id <> p_exclude_id)
    and (
      (p_name is not null and (
        sp.name ilike p_name or p_name ilike sp.name
        or similarity(sp.name, p_name) > 0.4
        or p_name = any(sp.aliases)
      ))
      or (public.normalize_phone(p_phone) is not null
          and public.normalize_phone(p_phone) = public.normalize_phone(sp.phone))
    )
  order by score desc
  limit 8
$$;

create or replace function public.find_similar_contacts(
  p_name text,
  p_phone text default null,
  p_email text default null,
  p_exclude_id uuid default null
) returns table(id uuid, name text, phone text, email text, relationship text, confirmed boolean, score numeric, reason text)
language sql
stable
as $$
  select
    sc.id, sc.name, sc.phone, sc.email, sc.relationship, sc.confirmed,
    greatest(
      case when p_name is not null and p_name = any(sc.aliases) then 1.00 else 0 end,
      case when public.normalize_phone(p_phone) is not null
             and public.normalize_phone(p_phone) = public.normalize_phone(sc.phone)
           then 0.95 else 0 end,
      case when p_email is not null and lower(trim(p_email)) = lower(trim(coalesce(sc.email, '')))
             and lower(trim(p_email)) <> '' then 0.95 else 0 end,
      case when p_name is not null and (sc.name ilike p_name or p_name ilike sc.name) then 0.85 else 0 end,
      case when p_name is not null then similarity(sc.name, p_name) else 0 end
    )::numeric as score,
    case
      when p_name is not null and p_name = any(sc.aliases) then 'alias'
      when public.normalize_phone(p_phone) is not null
           and public.normalize_phone(p_phone) = public.normalize_phone(sc.phone) then 'phone'
      when p_email is not null and lower(trim(p_email)) = lower(trim(coalesce(sc.email, '')))
           and lower(trim(p_email)) <> '' then 'email'
      when p_name is not null and (sc.name ilike p_name or p_name ilike sc.name) then 'name_containment'
      else 'name_similarity'
    end as reason
  from public.saved_contacts sc
  where sc.dismissed_at is null
    and (p_exclude_id is null or sc.id <> p_exclude_id)
    and (
      (p_name is not null and (
        sc.name ilike p_name or p_name ilike sc.name
        or similarity(sc.name, p_name) > 0.4
        or p_name = any(sc.aliases)
      ))
      or (public.normalize_phone(p_phone) is not null
          and public.normalize_phone(p_phone) = public.normalize_phone(sc.phone))
      or (p_email is not null and lower(trim(p_email)) = lower(trim(coalesce(sc.email, '')))
          and lower(trim(p_email)) <> '')
    )
  order by score desc
  limit 8
$$;

-- ── Whole-table duplicate pair scans (used by the Settings "Possible ──
-- ── Duplicates" panel; client groups pairs into connected components) ──

create or replace function public.find_duplicate_place_pairs()
returns table(place_a uuid, place_b uuid, name_a text, name_b text, score numeric, reason text)
language sql
stable
as $$
  select
    a.id, b.id, a.name, b.name,
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
  order by score desc
$$;

create or replace function public.find_duplicate_contact_pairs()
returns table(contact_a uuid, contact_b uuid, name_a text, name_b text, score numeric, reason text)
language sql
stable
as $$
  select
    a.id, b.id, a.name, b.name,
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
  order by score desc
$$;

-- Relationship-label duplicates: same family_member+contact or contact+place
-- pair recorded more than once (e.g. "doctor" vs "pediatrician" for the same
-- person). These don't need field-merging, just consolidating down to one row.

create or replace function public.find_duplicate_family_link_groups()
returns table(family_member_id uuid, contact_id uuid, relationship_ids uuid[], relationships text[])
language sql
stable
as $$
  select family_member_id, contact_id,
    array_agg(id order by confirmed desc, created_at),
    array_agg(relationship order by confirmed desc, created_at)
  from public.family_contact_relationships
  where dismissed_at is null
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
  from public.contact_place_relationships
  where dismissed_at is null
  group by contact_id, place_id
  having count(*) > 1
$$;

-- ── Safe merge: reassign every reference from merge_ids to keep_id, fill ──
-- ── blank fields on the survivor, union aliases (including old names), ──
-- ── then delete the losers. Runs in the caller's transaction. ──

create or replace function public.merge_saved_places(p_keep_id uuid, p_merge_ids uuid[])
returns void
language plpgsql
as $$
declare
  v_merge_id uuid;
  v_keep public.saved_places%rowtype;
  v_merge public.saved_places%rowtype;
begin
  if p_keep_id = any(p_merge_ids) then
    raise exception 'keep_id cannot appear in merge_ids';
  end if;

  select * into v_keep from public.saved_places where id = p_keep_id for update;
  if not found then
    raise exception 'saved_places % not found', p_keep_id;
  end if;

  foreach v_merge_id in array p_merge_ids loop
    select * into v_merge from public.saved_places where id = v_merge_id for update;
    if not found then continue; end if;

    update public.saved_contacts
       set primary_place_id = p_keep_id
     where primary_place_id = v_merge_id;

    -- drop merge-side relationship rows that would collide with a keep-side
    -- row on the (contact_id, place_id, relationship) unique key, then move
    -- the rest over.
    delete from public.contact_place_relationships cpr
     where cpr.place_id = v_merge_id
       and exists (
         select 1 from public.contact_place_relationships keep_cpr
         where keep_cpr.place_id = p_keep_id
           and keep_cpr.contact_id = cpr.contact_id
           and keep_cpr.relationship = cpr.relationship
       );
    update public.contact_place_relationships
       set place_id = p_keep_id
     where place_id = v_merge_id;

    update public.saved_places set
      address = coalesce(nullif(v_keep.address, ''), v_merge.address),
      city = coalesce(nullif(v_keep.city, ''), v_merge.city),
      state = coalesce(nullif(v_keep.state, ''), v_merge.state),
      zip = coalesce(nullif(v_keep.zip, ''), v_merge.zip),
      phone = coalesce(nullif(v_keep.phone, ''), v_merge.phone),
      lat = coalesce(v_keep.lat, v_merge.lat),
      lng = coalesce(v_keep.lng, v_merge.lng),
      google_place_id = coalesce(v_keep.google_place_id, v_merge.google_place_id),
      notes = case
        when coalesce(v_keep.notes, '') = '' then v_merge.notes
        when coalesce(v_merge.notes, '') = '' or v_keep.notes = v_merge.notes then v_keep.notes
        else v_keep.notes || E'\n' || v_merge.notes
      end,
      aliases = (
        select coalesce(array_agg(distinct alias), '{}')
        from unnest(v_keep.aliases || v_merge.aliases || array[v_merge.name]) as alias
        where alias is not null and alias <> '' and alias <> v_keep.name
      ),
      occurrence_count = v_keep.occurrence_count + v_merge.occurrence_count,
      confirmed = v_keep.confirmed or v_merge.confirmed,
      source = case when v_keep.source = 'manual' or v_merge.source = 'manual' then 'manual' else v_keep.source end
    where id = p_keep_id
    returning * into v_keep;

    delete from public.saved_places where id = v_merge_id;
  end loop;
end;
$$;

create or replace function public.merge_saved_contacts(p_keep_id uuid, p_merge_ids uuid[])
returns void
language plpgsql
as $$
declare
  v_merge_id uuid;
  v_keep public.saved_contacts%rowtype;
  v_merge public.saved_contacts%rowtype;
begin
  if p_keep_id = any(p_merge_ids) then
    raise exception 'keep_id cannot appear in merge_ids';
  end if;

  select * into v_keep from public.saved_contacts where id = p_keep_id for update;
  if not found then
    raise exception 'saved_contacts % not found', p_keep_id;
  end if;

  foreach v_merge_id in array p_merge_ids loop
    select * into v_merge from public.saved_contacts where id = v_merge_id for update;
    if not found then continue; end if;

    delete from public.family_contact_relationships fcr
     where fcr.contact_id = v_merge_id
       and exists (
         select 1 from public.family_contact_relationships keep_fcr
         where keep_fcr.contact_id = p_keep_id
           and keep_fcr.family_member_id = fcr.family_member_id
           and keep_fcr.relationship = fcr.relationship
       );
    update public.family_contact_relationships
       set contact_id = p_keep_id
     where contact_id = v_merge_id;

    delete from public.contact_place_relationships cpr
     where cpr.contact_id = v_merge_id
       and exists (
         select 1 from public.contact_place_relationships keep_cpr
         where keep_cpr.contact_id = p_keep_id
           and keep_cpr.place_id = cpr.place_id
           and keep_cpr.relationship = cpr.relationship
       );
    update public.contact_place_relationships
       set contact_id = p_keep_id
     where contact_id = v_merge_id;

    update public.saved_contacts set
      relationship = coalesce(nullif(v_keep.relationship, ''), v_merge.relationship),
      phone = coalesce(nullif(v_keep.phone, ''), v_merge.phone),
      email = coalesce(nullif(v_keep.email, ''), v_merge.email),
      address = coalesce(nullif(v_keep.address, ''), v_merge.address),
      primary_place_id = coalesce(v_keep.primary_place_id, v_merge.primary_place_id),
      primary_place_source = coalesce(v_keep.primary_place_source, v_merge.primary_place_source),
      notes = case
        when coalesce(v_keep.notes, '') = '' then v_merge.notes
        when coalesce(v_merge.notes, '') = '' or v_keep.notes = v_merge.notes then v_keep.notes
        else v_keep.notes || E'\n' || v_merge.notes
      end,
      aliases = (
        select coalesce(array_agg(distinct alias), '{}')
        from unnest(v_keep.aliases || v_merge.aliases || array[v_merge.name]) as alias
        where alias is not null and alias <> '' and alias <> v_keep.name
      ),
      occurrence_count = v_keep.occurrence_count + v_merge.occurrence_count,
      confirmed = v_keep.confirmed or v_merge.confirmed,
      source = case when v_keep.source = 'manual' or v_merge.source = 'manual' then 'manual' else v_keep.source end
    where id = p_keep_id
    returning * into v_keep;

    delete from public.saved_contacts where id = v_merge_id;
  end loop;
end;
$$;

comment on function public.find_similar_places is
  'Fuzzy lookup used before creating a new saved_places row (manual add forms, AI auto-create) to offer existing matches instead of creating a duplicate.';
comment on function public.find_similar_contacts is
  'Fuzzy lookup used before creating a new saved_contacts row (manual add forms, event contact fields) to offer existing matches instead of creating a duplicate.';
comment on function public.find_duplicate_place_pairs is
  'Whole-table duplicate scan for the Settings "Possible Duplicates" review panel. Client groups pairs into connected components.';
comment on function public.find_duplicate_contact_pairs is
  'Whole-table duplicate scan for the Settings "Possible Duplicates" review panel. Client groups pairs into connected components.';
comment on function public.merge_saved_places is
  'Reassigns all references from merge_ids to keep_id, fills blank fields on the survivor, unions aliases, then deletes the merged rows.';
comment on function public.merge_saved_contacts is
  'Reassigns all references from merge_ids to keep_id, fills blank fields on the survivor, unions aliases, then deletes the merged rows.';
