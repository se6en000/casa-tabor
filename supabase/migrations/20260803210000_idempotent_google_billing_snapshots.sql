alter table public.billing_line_items
  add column if not exists source_key text;

update public.billing_line_items
set source_key = md5(concat_ws(
  '|',
  usage_date::text,
  project_id,
  coalesce(service_id, ''),
  service_name,
  coalesce(sku_id, ''),
  sku_name,
  coalesce(usage_unit, '')
))
where source_key is null;

alter table public.billing_line_items
  alter column source_key set not null;

create unique index if not exists billing_line_items_source_key_idx
  on public.billing_line_items (source_key);

create table if not exists public.billing_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  period_start date not null,
  period_end date not null,
  status text not null check (status in ('running', 'success', 'error')),
  row_count integer,
  error_class text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check (period_end >= period_start)
);

alter table public.billing_sync_runs enable row level security;

create policy "service role manages billing sync runs"
  on public.billing_sync_runs for all to service_role using (true) with check (true);

