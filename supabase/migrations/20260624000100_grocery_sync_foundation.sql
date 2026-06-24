alter table public.grocery_items
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz,
  add column if not exists ios_reminder_id text,
  add column if not exists ios_updated_at timestamptz,
  add column if not exists sync_version bigint not null default 1,
  add column if not exists last_modified_source text not null default 'casa';

create unique index if not exists grocery_items_ios_reminder_id_uidx
  on public.grocery_items (ios_reminder_id)
  where ios_reminder_id is not null;

create index if not exists grocery_items_updated_at_idx on public.grocery_items(updated_at);
create index if not exists grocery_items_deleted_at_idx on public.grocery_items(deleted_at);

create or replace function public.bump_grocery_item_version()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.sync_version := coalesce(old.sync_version, 1) + 1;
  return new;
end;
$$;

drop trigger if exists grocery_items_updated_at_version on public.grocery_items;
create trigger grocery_items_updated_at_version
before update on public.grocery_items
for each row execute function public.bump_grocery_item_version();
