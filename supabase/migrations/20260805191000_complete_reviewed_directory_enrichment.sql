-- The first enrichment migration intentionally limited category/link writes to
-- unconfirmed candidates. A candidate can be confirmed by the lightweight
-- review action before this migration runs, while retaining source='derived'.
-- Complete only those evidence-backed records; never overwrite a manual row or
-- an existing primary-place choice.

with place_event_matches as (
  select distinct
    place.id as place_id,
    event.id as event_id,
    case enrichment.category
      when 'medical' then 'medical'
      when 'school' then 'school'
      when 'sports' then 'sports'
      when 'work' then 'work'
      when 'dining' then 'restaurant'
      when 'travel' then 'travel'
      when 'errand' then 'errand'
      when 'home_maintenance' then 'home_service'
      when 'social' then 'social'
      when 'birthday' then 'social'
      else null
    end as mapped_category
  from public.saved_places place
  join public.events event
    on event.deleted_at is null
    and event.status = 'confirmed'
    and (
      (
        nullif(trim(event.address), '') is not null
        and nullif(trim(concat_ws(', ', place.address, place.city, place.state, place.zip)), '') is not null
        and regexp_replace(lower(trim(event.address)), '[^[:alnum:]]+', '', 'g')
          = regexp_replace(
            lower(trim(concat_ws(', ', place.address, place.city, place.state, place.zip))),
            '[^[:alnum:]]+',
            '',
            'g'
          )
      )
      or (
        nullif(trim(event.location_name), '') is not null
        and (
          regexp_replace(lower(trim(event.location_name)), '[^[:alnum:]]+', '', 'g')
            = regexp_replace(lower(trim(place.name)), '[^[:alnum:]]+', '', 'g')
          or exists (
            select 1
            from unnest(place.aliases) as place_alias(value)
            where regexp_replace(lower(trim(event.location_name)), '[^[:alnum:]]+', '', 'g')
              = regexp_replace(lower(trim(place_alias.value)), '[^[:alnum:]]+', '', 'g')
          )
        )
      )
    )
  left join public.event_enrichments enrichment on enrichment.event_id = event.id
  where place.source = 'derived'
    and place.category = 'other'
),
category_counts as (
  select
    place_id,
    mapped_category,
    count(*) as event_count,
    row_number() over (
      partition by place_id
      order by count(*) desc, mapped_category
    ) as category_rank
  from place_event_matches
  where mapped_category is not null
  group by place_id, mapped_category
),
best_categories as (
  select place_id, mapped_category
  from category_counts
  where category_rank = 1
)
update public.saved_places place
set category = best_category.mapped_category
from best_categories best_category
where place.id = best_category.place_id
  and place.source = 'derived'
  and place.category = 'other';

with contact_event_matches as (
  select distinct
    contact.id as contact_id,
    event.id as event_id,
    event.location_name,
    event.address
  from public.saved_contacts contact
  join public.event_enrichments enrichment
    on regexp_replace(lower(trim(enrichment.contact_name)), '[^[:alnum:]]+', '', 'g')
      = regexp_replace(lower(trim(contact.name)), '[^[:alnum:]]+', '', 'g')
  join public.events event
    on event.id = enrichment.event_id
    and event.deleted_at is null
    and event.status = 'confirmed'
  where enrichment.contact_name is not null
    and nullif(trim(enrichment.contact_name), '') is not null
    and contact.source = 'derived'
    and contact.primary_place_id is null
    and not exists (
      select 1
      from public.family_members member
      where regexp_replace(lower(trim(contact.name)), '[^[:alnum:]]+', '', 'g')
        like regexp_replace(lower(trim(member.name)), '[^[:alnum:]]+', '', 'g') || '%'
    )
),
contact_place_matches as (
  select distinct
    contact_event.contact_id,
    contact_event.event_id,
    place.id as place_id
  from contact_event_matches contact_event
  join public.saved_places place
    on (
      nullif(trim(contact_event.address), '') is not null
      and nullif(trim(concat_ws(', ', place.address, place.city, place.state, place.zip)), '') is not null
      and regexp_replace(lower(trim(contact_event.address)), '[^[:alnum:]]+', '', 'g')
        = regexp_replace(
          lower(trim(concat_ws(', ', place.address, place.city, place.state, place.zip))),
          '[^[:alnum:]]+',
          '',
          'g'
        )
    )
    or (
      nullif(trim(contact_event.location_name), '') is not null
      and (
        regexp_replace(lower(trim(contact_event.location_name)), '[^[:alnum:]]+', '', 'g')
          = regexp_replace(lower(trim(place.name)), '[^[:alnum:]]+', '', 'g')
        or exists (
          select 1
          from unnest(place.aliases) as place_alias(value)
          where regexp_replace(lower(trim(contact_event.location_name)), '[^[:alnum:]]+', '', 'g')
            = regexp_replace(lower(trim(place_alias.value)), '[^[:alnum:]]+', '', 'g')
        )
      )
    )
),
place_link_counts as (
  select
    contact_id,
    place_id,
    count(distinct event_id) as event_count,
    lead(count(distinct event_id)) over (
      partition by contact_id
      order by count(distinct event_id) desc, place_id
    ) as next_event_count,
    row_number() over (
      partition by contact_id
      order by count(distinct event_id) desc, place_id
    ) as place_rank
  from contact_place_matches
  group by contact_id, place_id
),
best_links as (
  select contact_id, place_id
  from place_link_counts
  where place_rank = 1
    and event_count >= 2
    and coalesce(next_event_count, 0) < event_count
)
update public.saved_contacts contact
set
  primary_place_id = best_link.place_id,
  primary_place_source = 'derived'
from best_links best_link
where contact.id = best_link.contact_id
  and contact.source = 'derived'
  and contact.primary_place_id is null;
