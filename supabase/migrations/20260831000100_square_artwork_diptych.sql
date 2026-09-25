-- Add aspect_format and pair_id for 1:1 square photo diptychs
alter table public.personal_artwork
  add column if not exists aspect_format text not null default 'widescreen_16_9',
  add column if not exists pair_id uuid null;

-- Add check constraint for aspect_format if not already present
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'personal_artwork_aspect_format_check'
  ) then
    alter table public.personal_artwork
      add constraint personal_artwork_aspect_format_check
      check (aspect_format in ('widescreen_16_9', 'square_1_1'));
  end if;
end $$;

-- Create index for fast format filtering and sorting
create index if not exists idx_personal_artwork_aspect_format
  on public.personal_artwork(aspect_format, sort_order, created_at);

create index if not exists idx_personal_artwork_pair_id
  on public.personal_artwork(pair_id);
