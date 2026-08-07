-- Snooze had no memory: `snoozed_until` alone told the app "hide until this
-- time" but nothing about how many times an item has already been punted,
-- or when it was last snoozed. That meant a card resurfacing after its 5th
-- snooze looked identical to one snoozed for the first time — no way to see
-- "this keeps getting punted" on sight, and no way to build a "recently
-- snoozed" indicator on the card once it reappears.
alter table public.prep_items
  add column if not exists snooze_count integer not null default 0,
  add column if not exists last_snoozed_at timestamptz;

alter table public.conflicts
  add column if not exists snooze_count integer not null default 0,
  add column if not exists last_snoozed_at timestamptz;

-- Atomic increment so a rapid double-tap can't silently drop a count update
-- (a plain client-side read-then-write update would race).
create or replace function public.snooze_prep_item(p_prep_item_id uuid, p_snoozed_until timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.prep_items
  set
    snoozed_until = p_snoozed_until,
    snooze_count = snooze_count + 1,
    last_snoozed_at = now()
  where id = p_prep_item_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.snooze_conflict(p_conflict_id uuid, p_snoozed_until timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conflicts
  set
    snoozed_until = p_snoozed_until,
    snooze_count = snooze_count + 1,
    last_snoozed_at = now()
  where id = p_conflict_id;

  return jsonb_build_object('ok', true);
end;
$$;
