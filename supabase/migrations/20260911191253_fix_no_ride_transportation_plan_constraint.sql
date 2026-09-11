-- Real bug, confirmed live 2026-09-11: selecting "At Home (No Drive)" in the
-- event sidecar never persisted. buildEventTransportationPlanForMode's 'none'
-- mode legitimately builds { version: 1, legs: [], ... } -- a real, valid,
-- confirmed-no-ride plan -- and multiple existing read paths (LargeEventCard,
-- StackedView, EventBlock, calendarResponsibility.ts) already deliberately key
-- off exactly that shape (non-null transportation_plan + empty legs array) to
-- mean "no one is driving, confirmed." But the "harden" migration
-- (20260715115000, same day as the original) added
-- `jsonb_array_length(legs) > 0`, which rejects that exact legitimate shape --
-- so the entire upsert (not just this column) was silently rejected with a
-- 400 every time, leaving whatever driving plan existed before untouched.
-- Reverting to the original (pre-harden) shape check: still requires a real
-- object with version 1 and a legs array, just no longer requires it to be
-- non-empty -- restores the actual write path without weakening the other
-- structural guarantees the hardening pass was for.

alter table public.event_plan_overrides
  drop constraint if exists event_plan_overrides_transportation_plan_check;

alter table public.event_plan_overrides
  add constraint event_plan_overrides_transportation_plan_check
  check (
    transportation_plan is null
    or (
      jsonb_typeof(transportation_plan) = 'object'
      and transportation_plan->>'version' = '1'
      and transportation_plan ? 'legs'
      and jsonb_typeof(transportation_plan->'legs') = 'array'
    )
  );
