-- User-confirmed identity: Liv and Olivia are the same family member.
-- Calendar history explicitly identifies Wanuck, Hier & Associates as Liv's dentist.
with dentist_place as (
  select id
  from public.saved_places
  where lower(name) = lower('Wanuck, Hier & Associates, 1232 W Indiantown Rd #109, Jupiter, FL 33458, USA')
  limit 1
)
update public.saved_contacts contact
set
  aliases = (
    select array_agg(distinct alias order by alias)
    from unnest(coalesce(contact.aliases, '{}'::text[]) || array[
      'dentist kids',
      'Liv''s dentist',
      'Olivia''s dentist'
    ]) as alias
  ),
  relationship = 'pediatric dentist',
  notes = 'Confirmed pediatric dentist for Liv (Olivia) from calendar history.',
  primary_place_id = dentist_place.id,
  primary_place_source = 'manual'
from dentist_place
where lower(contact.name) = lower('Wanuck, Hier & Associates');
