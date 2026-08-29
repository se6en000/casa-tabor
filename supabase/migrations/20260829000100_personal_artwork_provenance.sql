-- Add provenance and rich editorial metadata fields to personal_artwork
alter table public.personal_artwork
  add column if not exists location text,
  add column if not exists date_taken text,
  add column if not exists description text,
  add column if not exists subjects text,
  add column if not exists medium text default 'Color photograph',
  add column if not exists fun_fact text;
