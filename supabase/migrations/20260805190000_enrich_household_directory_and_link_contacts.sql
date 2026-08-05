-- Enrich the reviewable household directory from existing event history.
--
-- The directory deliberately separates:
--   places = where the household goes
--   contacts = who the household knows or reaches there
--
-- A contact may point to one primary place. The link is nullable because not
-- every person/provider has a stable destination, and derived links remain
-- unconfirmed until a household member reviews the entry.

alter table public.saved_places
  add column if not exists last_seen_at timestamptz;

alter table public.saved_contacts
  add column if not exists primary_place_id uuid references public.saved_places(id) on delete set null,
  add column if not exists primary_place_source text,
  add column if not exists last_seen_at timestamptz;

alter table public.saved_contacts
  drop constraint if exists saved_contacts_primary_place_source_check;
alter table public.saved_contacts
  add constraint saved_contacts_primary_place_source_check
  check (primary_place_source is null or primary_place_source in ('manual', 'derived'));

create index if not exists saved_contacts_primary_place_id_idx
  on public.saved_contacts (primary_place_id)
  where primary_place_id is not null;

comment on column public.saved_contacts.primary_place_id is
  'The destination where this person or provider is usually reached. Keeps a person linked to the canonical place address.';
comment on column public.saved_contacts.primary_place_source is
  'Whether the primary-place link was chosen by a household member or derived from repeated event evidence.';
comment on column public.saved_places.last_seen_at is
  'Most recent confirmed event whose exact address or location name matched this place.';
comment on column public.saved_contacts.last_seen_at is
  'Most recent confirmed event whose extracted contact name exactly matched this contact.';

-- Exact address/location matching only. Fuzzy matching belongs in interactive
-- suggestions, never in a data migration that could create false associations.
with place_event_matches as (
  select distinct
    place.id as place_id,
    event.id as event_id,
    event.start_time,
    nullif(trim(event.address), '') as event_address,
    nullif(trim(event.location_name), '') as event_location_name,
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
),
place_event_rollup as (
  select
    place_id,
    count(distinct event_id)::integer as event_count,
    max(start_time) as last_seen_at,
    (array_agg(event_address order by start_time desc)
      filter (where event_address is not null))[1] as latest_address,
    array_agg(distinct event_location_name)
      filter (where event_location_name is not null) as observed_location_names
  from place_event_matches
  group by place_id
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
set
  occurrence_count = greatest(place.occurrence_count, rollup.event_count),
  last_seen_at = greatest(coalesce(place.last_seen_at, '-infinity'::timestamptz), rollup.last_seen_at),
  address = coalesce(nullif(trim(place.address), ''), rollup.latest_address),
  aliases = array(
    select distinct candidate
    from unnest(
      coalesce(place.aliases, '{}'::text[])
      || coalesce(rollup.observed_location_names, '{}'::text[])
    ) as observed(candidate)
    where nullif(trim(candidate), '') is not null
      and regexp_replace(lower(trim(candidate)), '[^[:alnum:]]+', '', 'g')
        <> regexp_replace(lower(trim(place.name)), '[^[:alnum:]]+', '', 'g')
  ),
  category = case
    when place.confirmed = false
      and place.category = 'other'
      and best_category.mapped_category is not null
      then best_category.mapped_category
    else place.category
  end
from place_event_rollup rollup
left join best_categories best_category on best_category.place_id = rollup.place_id
where place.id = rollup.place_id;

with contact_event_matches as (
  select distinct
    contact.id as contact_id,
    event.id as event_id,
    event.start_time,
    nullif(trim(enrichment.contact_phone), '') as observed_phone,
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
    and not exists (
      select 1
      from public.family_members member
      where regexp_replace(lower(trim(contact.name)), '[^[:alnum:]]+', '', 'g')
        like regexp_replace(lower(trim(member.name)), '[^[:alnum:]]+', '', 'g') || '%'
    )
),
contact_event_rollup as (
  select
    contact_id,
    count(distinct event_id)::integer as event_count,
    max(start_time) as last_seen_at
  from contact_event_matches
  group by contact_id
),
phone_counts as (
  select
    contact_id,
    observed_phone,
    count(*) as observation_count,
    lead(count(*)) over (
      partition by contact_id
      order by count(*) desc, observed_phone
    ) as next_observation_count,
    row_number() over (
      partition by contact_id
      order by count(*) desc, observed_phone
    ) as phone_rank
  from contact_event_matches
  where observed_phone is not null
  group by contact_id, observed_phone
),
best_phones as (
  select contact_id, observed_phone
  from phone_counts
  where phone_rank = 1
    and observation_count >= 2
    and coalesce(next_observation_count, 0) < observation_count
)
update public.saved_contacts contact
set
  occurrence_count = greatest(contact.occurrence_count, rollup.event_count),
  last_seen_at = greatest(coalesce(contact.last_seen_at, '-infinity'::timestamptz), rollup.last_seen_at),
  phone = case
    when contact.confirmed = false and contact.source = 'derived'
      then coalesce(best_phone.observed_phone, contact.phone)
    else contact.phone
  end
from contact_event_rollup rollup
left join best_phones best_phone on best_phone.contact_id = rollup.contact_id
where contact.id = rollup.contact_id;

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
  and contact.primary_place_id is null
  and contact.confirmed = false
  and contact.source = 'derived';
