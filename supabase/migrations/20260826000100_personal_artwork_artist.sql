-- Add artist column to personal_artwork
alter table public.personal_artwork
  add column if not exists artist text;
