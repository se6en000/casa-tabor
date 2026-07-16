-- Saved places are household-approved destinations. Repair only exact active
-- matches whose prior automatic location projection is still blocked; the client
-- treats all exact matches as confirmed without generating unnecessary sync work.
with saved_address_matches as (
  select distinct
    event.id as event_id,
    concat_ws(
      '|',
      lower(trim(coalesce(event.location_name, ''))),
      lower(trim(coalesce(event.address, ''))),
      coalesce(event.lat::text, ''),
      coalesce(event.lng::text, '')
    ) as location_signature
  from public.events event
  join public.saved_places place
    on regexp_replace(lower(trim(coalesce(event.address, ''))), '[^[:alnum:]]+', '', 'g')
      = regexp_replace(
        lower(trim(concat_ws(', ', place.address, place.city, place.state, place.zip))),
        '[^[:alnum:]]+',
        '',
        'g'
      )
  where event.event_type = 'event'
    and event.deleted_at is null
    and event.status <> 'cancelled'
    and nullif(trim(event.address), '') is not null
    and nullif(trim(concat_ws(', ', place.address, place.city, place.state, place.zip)), '') is not null
)
update public.event_plan_overrides override
set
  verified = true,
  location_signature = match.location_signature,
  location_projection_blocked = false
from saved_address_matches match
where override.event_id = match.event_id
  and override.location_projection_blocked = true;
