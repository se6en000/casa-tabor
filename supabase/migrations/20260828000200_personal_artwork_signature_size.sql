-- Add signature_size to personal_artwork
alter table public.personal_artwork
  add column if not exists signature_size text default 'md';
