-- Aligns discover_directory_candidates()'s "does this already exist?" checks
-- with the shared find_similar_places/find_similar_contacts fuzzy-match
-- functions instead of re-implementing the same ilike/similarity/alias logic
-- inline. Pure refactor: behavior is intentionally kept equivalent (same
-- name/alias/similarity>0.6 dedupe rule, phone matching NOT added), reducing
-- duplication between the two dedupe strategies now backed by one function.
--
-- Both fuzzy-match functions gain an additive `p_include_dismissed` parameter
-- (default false, matching every existing caller's behavior). The discovery
-- scan passes true: a dismissed place/contact still counts as "already
-- decided, do not re-suggest" here, exactly like the inline query it
-- replaces did before dismissed_at even existed. Filtering out dismissed
-- rows here would reintroduce the "suggestion keeps coming back" bug this
-- session already fixed for the confirm/dismiss UI, just through the
-- discovery-scan door instead.
create or replace function public.find_similar_places(
  p_name text,
  p_phone text default null,
  p_exclude_id uuid default null,
  p_include_dismissed boolean default false
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
  where (p_include_dismissed or sp.dismissed_at is null)
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
  p_exclude_id uuid default null,
  p_include_dismissed boolean default false
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
  where (p_include_dismissed or sc.dismissed_at is null)
    and (p_exclude_id is null or sc.id <> p_exclude_id)
    and (
      (p_name is not null and (
        sc.name ilike p_name or p_name ilike sc.name
        or similarity(sc.name, p_name) > 0.4
        or p_name = any(sc.aliases)
      ))
      or (public.normalize_phone(p_phone) is not null
          and public.normalize_phone(p_phone) = public.normalize_phone(sc.phone))
    )
  order by score desc
  limit 8
$$;

create or replace function public.discover_directory_candidates()
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  places_inserted integer := 0;
  contacts_inserted integer := 0;
  family_links_inserted integer := 0;
  connections_inserted integer := 0;
begin
  with candidate_places as (
    select
      n.id,
      trim(n.label) as name,
      nullif(trim(n.metadata->>'address'), '') as address
    from public.household_graph_nodes n
    where n.node_type = 'place'
      and n.ref_id is null
      and trim(coalesce(n.label, '')) <> ''
  ),
  place_categories as (
    select
      cp.id,
      mode() within group (order by
        case ee.category
          when 'medical' then 'medical'
          when 'school' then 'school'
          when 'sports' then 'sports'
          when 'work' then 'work'
          when 'dining' then 'restaurant'
          else 'other'
        end
      ) as top_category,
      count(distinct ev_node.id) as occurrence_count
    from candidate_places cp
    join public.household_graph_edges ge
      on ge.to_node_id = cp.id and ge.edge_type = 'at_place'
    join public.household_graph_nodes ev_node
      on ev_node.id = ge.from_node_id and ev_node.node_type = 'event'
    left join public.event_enrichments ee on ee.event_id = ev_node.ref_id
    group by cp.id
  ),
  deduped_places as (
    select distinct on (lower(regexp_replace(cp.name, '[^a-z0-9]+', '', 'gi')))
      cp.name,
      cp.address,
      coalesce(pc.top_category, 'other') as category,
      greatest(1, coalesce(pc.occurrence_count, 1)) as occurrence_count
    from candidate_places cp
    left join place_categories pc on pc.id = cp.id
    order by
      lower(regexp_replace(cp.name, '[^a-z0-9]+', '', 'gi')),
      coalesce(pc.occurrence_count, 1) desc
  ),
  inserted_places as (
    insert into public.saved_places (name, address, category, source, confirmed, occurrence_count, notes)
    select
      dp.name,
      dp.address,
      dp.category,
      'derived',
      false,
      dp.occurrence_count,
      'Auto-detected from event history; please confirm category and details.'
    from deduped_places dp
    where not exists (
      -- p_include_dismissed=true: a previously-dismissed place still blocks
      -- re-insertion here, same as before dismissed_at existed.
      select 1 from public.find_similar_places(dp.name, null, null, true) fsp
      where fsp.score >= 0.6
    )
    returning 1
  )
  select count(*) into places_inserted from inserted_places;

  with candidate_contacts as (
    select
      trim(ee.contact_name) as name,
      ee.contact_phone as phone,
      ee.category as category
    from public.event_enrichments ee
    join public.events e on e.id = ee.event_id
    where ee.contact_name is not null
      and trim(ee.contact_name) <> ''
      and e.deleted_at is null
      and not exists (
        select 1 from public.family_members fm
        where fm.name ilike trim(ee.contact_name)
      )
  ),
  aggregated_contacts as (
    select
      name,
      (array_agg(phone) filter (where phone is not null and trim(phone) <> ''))[1] as phone,
      mode() within group (order by category) as top_category,
      count(*) as occurrence_count
    from candidate_contacts
    group by name
  ),
  inserted_contacts as (
    insert into public.saved_contacts (name, phone, relationship, source, confirmed, occurrence_count, notes)
    select
      ac.name,
      ac.phone,
      case ac.top_category
        when 'medical' then 'doctor'
        when 'school' then 'school contact'
        when 'sports' then 'coach'
        when 'home_maintenance' then 'service provider'
        else 'contact'
      end,
      'derived',
      false,
      ac.occurrence_count,
      'Auto-detected from event history; please confirm relationship and details.'
    from aggregated_contacts ac
    where not exists (
      -- Name/alias/similarity only (no p_phone), matching the prior inline
      -- check exactly; p_include_dismissed=true for the same reason as places.
      select 1 from public.find_similar_contacts(ac.name, null, null, null, true) fsc
      where fsc.score >= 0.6
    )
    returning 1
  )
  select count(*) into contacts_inserted from inserted_contacts;

  -- Family links: only attribute a provider to a specific family member when
  -- the event has exactly one attendee, so a shared/whole-family event never
  -- gets mis-assigned to a single person.
  with candidate_family_links as (
    select
      em.family_member_id,
      sc.id as contact_id,
      coalesce(sc.relationship, 'contact') as relationship,
      count(distinct e.id) as occurrence_count
    from public.events e
    join public.event_enrichments ee on ee.event_id = e.id
    join public.saved_contacts sc on sc.name ilike trim(ee.contact_name)
    join public.event_members em on em.event_id = e.id
    where e.deleted_at is null
      and ee.contact_name is not null
      and trim(ee.contact_name) <> ''
      and (select count(*) from public.event_members em2 where em2.event_id = e.id) = 1
    group by em.family_member_id, sc.id, coalesce(sc.relationship, 'contact')
  ),
  inserted_family_links as (
    insert into public.family_contact_relationships (
      family_member_id, contact_id, relationship, source, confirmed, evidence_count, evidence_notes
    )
    select
      cfl.family_member_id,
      cfl.contact_id,
      cfl.relationship,
      'derived',
      false,
      cfl.occurrence_count,
      'Auto-detected from event history; please confirm.'
    from candidate_family_links cfl
    where not exists (
      select 1 from public.family_contact_relationships fcr
      where fcr.family_member_id = cfl.family_member_id
        and fcr.contact_id = cfl.contact_id
    )
    returning 1
  )
  select count(*) into family_links_inserted from inserted_family_links;

  -- Connections: a contact and a place co-occurring on the same event (the
  -- event's location matches a real, already-graphed place, and the event's
  -- enrichment names a contact) is treated as evidence the provider is
  -- reachable at that place. Never marked as-default; the household decides
  -- defaults on confirm.
  with candidate_connections as (
    select
      sc.id as contact_id,
      sp.id as place_id,
      count(distinct e.id) as occurrence_count
    from public.event_enrichments ee
    join public.events e on e.id = ee.event_id
    join public.saved_contacts sc on sc.name ilike trim(ee.contact_name)
    join public.household_graph_nodes ev_node
      on ev_node.node_type = 'event' and ev_node.ref_id = e.id
    join public.household_graph_edges ge
      on ge.from_node_id = ev_node.id and ge.edge_type = 'at_place'
    join public.household_graph_nodes pn
      on pn.id = ge.to_node_id and pn.node_type = 'place' and pn.ref_id is not null
    join public.saved_places sp
      on sp.id = pn.ref_id
    where e.deleted_at is null
      and ee.contact_name is not null
      and trim(ee.contact_name) <> ''
    group by sc.id, sp.id
  ),
  inserted_connections as (
    insert into public.contact_place_relationships (
      contact_id, place_id, relationship, is_default, source, confirmed, evidence_count, evidence_notes
    )
    select
      cc.contact_id,
      cc.place_id,
      'provider_location',
      false,
      'derived',
      false,
      cc.occurrence_count,
      'Auto-detected from event history; please confirm.'
    from candidate_connections cc
    where not exists (
      select 1 from public.contact_place_relationships cpr
      where cpr.contact_id = cc.contact_id
        and cpr.place_id = cc.place_id
    )
    returning 1
  )
  select count(*) into connections_inserted from inserted_connections;

  return jsonb_build_object(
    'places_inserted', places_inserted,
    'contacts_inserted', contacts_inserted,
    'family_links_inserted', family_links_inserted,
    'connections_inserted', connections_inserted
  );
end;
$$;
