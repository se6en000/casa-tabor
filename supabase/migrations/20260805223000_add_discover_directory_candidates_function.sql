-- Turns the one-time "backfill_household_directory_from_event_history"
-- migration into a repeatable function so new calendar activity keeps
-- surfacing unconfirmed directory suggestions over time, not just once.
--
-- Additive-only and idempotent: only inserts candidates that don't already
-- fuzzy-match an existing saved_places/saved_contacts row, and only inserts a
-- family_contact_relationships suggestion when no row (confirmed or not)
-- already exists for that (family_member, contact) pair. Everything it
-- writes is source='derived', confirmed=false, awaiting human review in the
-- Household Directory settings page.
create or replace function public.discover_directory_candidates()
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  places_inserted integer := 0;
  contacts_inserted integer := 0;
  family_links_inserted integer := 0;
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
      select 1 from public.saved_places sp
      where sp.name ilike dp.name
         or dp.name ilike sp.name
         or similarity(sp.name, dp.name) > 0.6
         or dp.name = any(sp.aliases)
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
      select 1 from public.saved_contacts sc
      where sc.name ilike ac.name
         or ac.name ilike sc.name
         or similarity(sc.name, ac.name) > 0.6
         or ac.name = any(sc.aliases)
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

  return jsonb_build_object(
    'places_inserted', places_inserted,
    'contacts_inserted', contacts_inserted,
    'family_links_inserted', family_links_inserted
  );
end;
$$;
