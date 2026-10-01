-- Travel (design doc "Casa: Travel design", canvas row 19): how each person travels, set once on their page.
-- { "airport_minutes": 60, "deplane_minutes": 30, "way": "uber" | "someone" | "drive_park" }
-- Jake, 2026-10-01: "kelly would need 2, I usually need 1, kids probably 2 hours or more" and "I usually uber".
alter table public.family_members add column if not exists travel_prefs jsonb;

update public.family_members set travel_prefs = '{"airport_minutes": 60, "way": "uber"}'::jsonb
 where name = 'Jake' and travel_prefs is null;
update public.family_members set travel_prefs = '{"airport_minutes": 120}'::jsonb
 where name = 'Kelly' and travel_prefs is null;
