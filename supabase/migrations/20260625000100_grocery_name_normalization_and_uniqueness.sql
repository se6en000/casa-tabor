alter table public.grocery_items
  add column if not exists name_normalized text
  generated always as (
    regexp_replace(lower(btrim(name)), '\s+', ' ', 'g')
  ) stored;

with ranked as (
  select
    id,
    row_number() over (
      partition by list_id, name_normalized
      order by
        (ios_reminder_id is not null) desc,
        char_length(coalesce(notes, '')) desc,
        char_length(coalesce(quantity, '')) desc,
        updated_at desc,
        created_at asc
    ) as rn
  from public.grocery_items
  where checked = false
    and deleted_at is null
)
update public.grocery_items gi
set
  deleted_at = now(),
  last_modified_source = 'casa'
from ranked
where gi.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists grocery_items_active_name_unique_idx
  on public.grocery_items (list_id, name_normalized)
  where checked = false and deleted_at is null;

create index if not exists grocery_items_name_normalized_idx
  on public.grocery_items (name_normalized);
