-- An outing's card (canvas 77; Jake, Oct 8: "tell me more, gets the details online and display it"): what its own page
-- says, read once when the card first opens and kept (a week).
alter table public.outings add column if not exists details jsonb;
alter table public.outings add column if not exists details_at timestamptz;
