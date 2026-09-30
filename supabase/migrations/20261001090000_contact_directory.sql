-- "8255 West Lake Drive, Lake Clark Shores, FL 33406": the street, then the city line.
create or replace function public.place_full_address(p public.saved_places)
returns text
language sql
immutable
as $$
  select nullif(concat_ws(', ',
    nullif(btrim(p.address), ''),
    nullif(concat_ws(', ', nullif(btrim(p.city), ''), nullif(btrim(concat_ws(' ', nullif(btrim(p.state), ''), nullif(btrim(p.zip), ''))), '')), '')
  ), '')
$$;

-- Directions to someone (FAMILY_WALL_PLAN.md; canvas 13c/13d, approved by Jake 2026-09-30): one answer to
-- "where does this person live", read by the phone's People and by Casa alike. An address can be kept in
-- three places — on the contact, on its main place, or on a place confirmed for it — and People and the
-- assistant read only the first two, so Alice's saved house (a confirmed place) was never found.
-- Order: the contact's own address, its main place, then a confirmed place (the default first, then the newest).
create or replace view public.contact_directory
with (security_invoker = true) as
select
  c.id,
  c.name,
  c.aliases,
  c.relationship,
  c.phone,
  c.email,
  c.confirmed,
  c.occurrence_count,
  c.dismissed_at,
  coalesce(nullif(btrim(c.address), ''), public.place_full_address(pp), public.place_full_address(lp)) as address,
  case
    when nullif(btrim(c.address), '') is not null then null
    when public.place_full_address(pp) is not null then pp.name
    else lp.name
  end as place_name
from public.saved_contacts c
left join public.saved_places pp on pp.id = c.primary_place_id and pp.dismissed_at is null
left join lateral (
  select p.*
  from public.contact_place_relationships r
  join public.saved_places p on p.id = r.place_id
  where r.contact_id = c.id and r.confirmed and r.dismissed_at is null and p.dismissed_at is null
    and nullif(btrim(p.address), '') is not null
  order by r.is_default desc, r.updated_at desc
  limit 1
) lp on true;
