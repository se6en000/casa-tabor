-- "Which one?" (Jake, Oct 2): when the lookup after an add isn't sure of a place, it keeps up to three choices here
-- (name, address, lat, lng) instead of writing a guess into the event; picking one clears them.
alter table public.event_enrichments add column if not exists place_choices jsonb;
