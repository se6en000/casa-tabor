-- Send to Tabor House (Jake, Oct 9: "right now I screen shot and paste into chat, if theres an easier way"): the iPhone
-- share sheet, or a double tap on the back of the phone (a screenshot), sends a link, words or a picture to the house.
-- It's read and filed: a place → saved to Places worth trying; a recipe → Recipes; dates (an event, a flyer, plans in a
-- text) → waiting for a yes, editable first, under "I have something for you". Every share is kept here.

-- Each person's key for the Shortcut (made in the phone app's Settings, shown once; only its hash is kept).
create table if not exists public.share_keys (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.family_members(id) on delete cascade,
  key_hash text not null unique,
  key_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists share_keys_member_idx on public.share_keys (member_id, created_at desc);
alter table public.share_keys enable row level security;
-- Server only (no policies): the share-in function checks keys.

create table if not exists public.shared_in (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.family_members(id) on delete set null,
  source text,                 -- 'Instagram' | 'TikTok' | a site's name | 'a screenshot' | 'a picture' | 'a text'
  url text,
  said_text text,              -- what was shared as words (trimmed)
  read text,                   -- what the house could read (caption, page), trimmed
  kind text not null default 'other' check (kind in ('events', 'place', 'recipe', 'other', 'unreadable')),
  summary text,
  items jsonb not null default '[]'::jsonb,   -- dates read, in the scanner's shape, waiting for a yes
  place_id uuid references public.guide_places(id) on delete set null,
  recipe_id uuid,
  reply text,                  -- what the phone was told
  status text not null default 'done' check (status in ('ask', 'added', 'skipped', 'done')),
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists shared_in_ask_idx on public.shared_in (status, created_at desc);
create index if not exists shared_in_member_idx on public.shared_in (member_id);
create index if not exists shared_in_place_idx on public.shared_in (place_id);
alter table public.shared_in enable row level security;
drop policy if exists "family full access" on public.shared_in;
create policy "family full access" on public.shared_in for all using (true) with check (true);
