-- Add artist signature overlay fields to personal_artwork
alter table public.personal_artwork
  add column if not exists signature_enabled boolean not null default false,
  add column if not exists signature_text text,
  add column if not exists signature_style text default 'fountain',
  add column if not exists signature_position text default 'bottom-right',
  add column if not exists signature_color text default 'auto';
