-- P3.22 step 2: what Casa suggests for a to-do — merge a duplicate, close one that's clearly over,
-- or move a grocery to Shopping. Each changes Jake's iOS list, so it waits for his yes on the wall.
alter table public.todo_details add column if not exists suggestion jsonb;
