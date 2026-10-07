-- The morning brief (canvas 58; Jake, Oct 6): the paper reaches deeper — today, the weekend, next month, way out,
-- one forgotten thing, the day's surprise and a joke. Written by supabase/functions/morning-paper with the rest.
alter table public.morning_papers add column if not exists brief jsonb;
-- What the web search found for the surprise, kept beside the paper so a wrong suggestion can be traced.
alter table public.morning_papers add column if not exists found text;
