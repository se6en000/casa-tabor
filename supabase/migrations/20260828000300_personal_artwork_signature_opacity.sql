-- Add signature_opacity to personal_artwork
alter table public.personal_artwork
  add column if not exists signature_opacity numeric default 0.55;
