create table if not exists grocery_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Weekly',
  created_at timestamptz not null default now()
);

create table if not exists grocery_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid references grocery_lists(id) on delete cascade,
  name text not null,
  quantity text,
  unit text,
  category text not null default 'other',
  checked boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists grocery_items_list_id_idx on grocery_items(list_id);
create index if not exists grocery_items_checked_idx on grocery_items(checked);

-- Insert default list
insert into grocery_lists (name) values ('Weekly') on conflict do nothing;
