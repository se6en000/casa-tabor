-- Vendor spend tracking for the Inbound Manifest. Until now no prep_item ever
-- persisted a real dollar amount -- the "$X" shown on a bill/delivery card was
-- always a regex guess re-run against free text at render time (extractAmount
-- in the frontend), which is fine for a single card but unusable for a trusted
-- running total: it can grab the wrong number, and there's nothing to sum in
-- SQL without re-scanning every historical row's text on every render.
--
-- amount_cents is now a real, queryable column, meant to be populated by the
-- Gmail classifier at ingestion time (scan-gmail-inbox) going forward, when it
-- extracts a genuine transaction total from the email itself. amount_estimated
-- marks rows filled by the one-time backfill (scripts/backfill-prep-item-amounts.mjs)
-- that re-ran the existing regex against historical description/event_title text,
-- so the UI can show those as an approximation rather than implying the same
-- precision as a freshly-extracted amount.

alter table public.prep_items
  add column if not exists amount_cents bigint,
  add column if not exists amount_estimated boolean not null default false;

comment on column public.prep_items.amount_cents is
  'Transaction total in cents, when this item represents a real charge/order (bill, payment, delivery). Null when not a monetary item.';
comment on column public.prep_items.amount_estimated is
  'True only for rows backfilled by re-scanning historical text with a regex, not extracted directly by the classifier at ingestion time.';

create index if not exists prep_items_vendor_spend_idx
  on public.prep_items (attention_vendor, created_at)
  where amount_cents is not null;

-- Per-vendor spend totals since a given timestamp. Excludes non-monetary items
-- (amount_cents is null) so "$0 forms/RSVPs" never dilute the total.
create or replace function public.get_vendor_spend_summary(p_since timestamptz)
returns table (
  vendor text,
  total_cents bigint,
  transaction_count bigint,
  has_estimated boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(nullif(trim(attention_vendor), ''), 'Other') as vendor,
    sum(amount_cents) as total_cents,
    count(*) as transaction_count,
    bool_or(amount_estimated) as has_estimated
  from public.prep_items
  where amount_cents is not null
    and created_at >= p_since
  group by 1
  order by total_cents desc;
$$;

revoke all on function public.get_vendor_spend_summary(timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_vendor_spend_summary(timestamptz)
  to anon, authenticated, service_role;

-- Individual transactions for one vendor since a given timestamp (drill-down).
create or replace function public.get_vendor_spend_transactions(p_vendor text, p_since timestamptz)
returns table (
  id uuid,
  description text,
  event_title text,
  amount_cents bigint,
  amount_estimated boolean,
  created_at timestamptz,
  source_type text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    id, description, event_title, amount_cents, amount_estimated, created_at, source_type
  from public.prep_items
  where amount_cents is not null
    and created_at >= p_since
    and coalesce(nullif(trim(attention_vendor), ''), 'Other') = p_vendor
  order by created_at desc;
$$;

revoke all on function public.get_vendor_spend_transactions(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_vendor_spend_transactions(text, timestamptz)
  to anon, authenticated, service_role;
