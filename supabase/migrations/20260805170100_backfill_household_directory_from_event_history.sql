-- One-time backfill: turn existing event history into unconfirmed household
-- directory candidates, additive-only (never touches existing confirmed rows).
--
-- Places: household_graph_nodes already computed and deduped "derived" place
-- candidates (locations seen in events that don't match a saved_places row) —
-- reuse that instead of re-deriving from events. Category is guessed from the
-- majority event_enrichments.category of events at that place; falls back to
-- 'other' for human review.
--
-- Contacts: event_enrichments.contact_name/contact_phone already holds
-- AI-extracted provider/business names+phones from real events (doctors,
-- schools, coaches, etc). Grouped/deduped by name, excluding anything that
-- matches an existing family member (so "Jake Tabor"'s own birthday event
-- doesn't become a "contact").
--
-- Everything inserted here is source='derived', confirmed=false — it must be
-- reviewed/confirmed (existing Saved Places settings page) before the
-- assistant treats it as authoritative. Safe to re-run: only inserts rows that
-- don't already exact/alias/fuzzy-match an existing row.

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
  -- household_graph rebuilds can produce near-duplicate labels for the same
  -- physical place; keep the most-seen label per normalized address+name.
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
)
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
);

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
)
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
);
