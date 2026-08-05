-- Fixes two compounding issues found in a full audit of Prep & Action / Recent Activity:
--
-- 1. prep_items.type is free text with zero DB enforcement. Over time it has drifted to
--    17 different values (reminder, forms, medical, payment, delivery, gift, general,
--    cancellation, prep, travel, response, billing, deadline, rsvp, dish, billing/payment,
--    return) even though the current AI prompt only offers 8 of them. Replaces it with a
--    real, enforced 9-category taxonomy designed around what a family of 5 with kids
--    actually deals with, used identically everywhere in the app (filter chips, card
--    badges, detail panel). `type` is kept for audit/rollback but is no longer the
--    source of truth for display.
--
-- 2. Overdue prep items were invisible everywhere: the frontend, apply-notification-policy,
--    and orchestrate-household all excluded anything past its due_by. Now that they're
--    surfaced instead of silently dropped (see usePrepItems.ts / apply-notification-policy
--    / orchestrate-household changes), add a safety valve so genuinely ancient, ignored
--    items don't accumulate forever: auto-dismiss (not delete) anything overdue by more
--    than 45 days that the user never acted on, tagged so it's distinguishable from a
--    real completion.

alter table public.prep_items add column if not exists category text;
alter table public.prep_items add column if not exists dismissed_reason text;

-- ── Backfill: map every historical free-text type to the new enforced category ──
update public.prep_items set category = case
  when type = 'gift' then 'gift_occasion'
  when type = 'dish' then 'food_hosting'
  when type = 'forms' then 'forms_paperwork'
  when type in ('payment', 'billing', 'billing/payment') then 'bills_payments'
  when type = 'travel' then 'travel_trips'
  when type = 'medical' then 'medical_health'
  when type in ('delivery', 'return') then 'household_errands'
  when type in ('rsvp', 'response') then 'rsvp_response'
  when type in ('reminder', 'general', 'prep', 'deadline') then 'general_todo'
  when type = 'cancellation' then 'general_todo'
  else 'general_todo'
end
where category is null;

-- cancellation-type rows are FYI ("this got cancelled"), not tasks -- they were already
-- all dismissed in production, but make it explicit going forward: nothing new should
-- ever land in prep_items typed as a cancellation again (see analyze-prep prompt change).
update public.prep_items
set dismissed = true, dismissed_at = coalesce(dismissed_at, now()), dismissed_reason = 'not_a_task'
where type = 'cancellation' and dismissed = false;

alter table public.prep_items
  drop constraint if exists prep_items_category_check,
  add constraint prep_items_category_check
    check (category is null or category in (
      'gift_occasion', 'food_hosting', 'forms_paperwork', 'bills_payments',
      'travel_trips', 'medical_health', 'household_errands', 'rsvp_response', 'general_todo'
    ));

create index if not exists prep_items_category_idx on public.prep_items(category);

-- ── Overdue safety valve ──
-- Auto-dismiss (never delete) prep items overdue by more than 45 days with no user
-- action, so surfacing overdue items (the actual fix) doesn't turn into an
-- ever-growing, never-ending backlog if something is truly abandoned.
create or replace function public.auto_expire_stale_prep_items()
returns integer
language sql
security definer
set search_path = public
as $$
  with expired as (
    update public.prep_items
    set dismissed = true,
        dismissed_at = now(),
        dismissed_reason = 'auto_expired_stale'
    where dismissed = false
      and due_by is not null
      and due_by < now() - interval '45 days'
    returning id
  )
  select count(*)::integer from expired;
$$;

revoke all on function public.auto_expire_stale_prep_items() from public, anon, authenticated;
grant execute on function public.auto_expire_stale_prep_items() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'auto-expire-stale-prep-items';
    perform cron.schedule(
      'auto-expire-stale-prep-items',
      '30 4 * * *',
      'select public.auto_expire_stale_prep_items()'
    );
  end if;
end;
$$;
