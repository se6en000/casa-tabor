-- Gift ideas per person (FAMILY_WALL_PLAN.md P3.19 step 2). Thoughtful gifts come from ideas collected
-- during the year ("Casa, gift idea for Kelly: that ceramic class"), brought back with that person's
-- heads-up. Saved by the assistant with a yes; read back only on the asker's phone and never to the
-- person they're for (giftIdeasForViewer). Server-only: row security on, no client policies.
create table if not exists public.gift_ideas (
  id uuid primary key default gen_random_uuid(),
  for_name text not null check (length(btrim(for_name)) > 0),
  for_member_id uuid references public.family_members(id) on delete set null,
  idea text not null check (length(btrim(idea)) > 0),
  source text not null default 'assistant',
  created_by_member_id uuid references public.family_members(id) on delete set null,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  dismissed_at timestamptz
);
create index if not exists gift_ideas_for_member_id_idx on public.gift_ideas (for_member_id);
create index if not exists gift_ideas_created_by_member_id_idx on public.gift_ideas (created_by_member_id);
create index if not exists gift_ideas_for_name_idx on public.gift_ideas (lower(for_name));
alter table public.gift_ideas enable row level security;
