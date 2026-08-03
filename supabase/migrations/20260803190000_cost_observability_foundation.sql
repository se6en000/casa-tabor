-- Billing-grade source ledgers and server-side dashboard aggregation.

create table if not exists public.ai_provider_calls (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  provider_request_id text,
  correlation_id text,
  request_id text,
  turn_id text,
  function_name text not null,
  capability text not null,
  lane text,
  call_purpose text not null,
  call_index integer not null default 1 check (call_index > 0),
  traffic_class text not null default 'user'
    check (traffic_class in ('user', 'background', 'qa', 'shadow')),
  provider text not null,
  model text not null,
  endpoint text,
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  thought_tokens bigint not null default 0 check (thought_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  total_tokens bigint not null default 0 check (total_tokens >= 0),
  prompt_chars integer check (prompt_chars is null or prompt_chars >= 0),
  tool_count integer check (tool_count is null or tool_count >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  status text not null check (status in ('success', 'provider_error', 'transport_error', 'cancelled')),
  http_status integer,
  finish_reason text,
  error_class text,
  retry_of uuid references public.ai_provider_calls(id),
  policy_mode text,
  policy_version text,
  channel text,
  device text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now()
);

create index if not exists ai_provider_calls_occurred_at_idx
  on public.ai_provider_calls (occurred_at desc);
create index if not exists ai_provider_calls_function_model_idx
  on public.ai_provider_calls (function_name, model, occurred_at desc);
create index if not exists ai_provider_calls_correlation_idx
  on public.ai_provider_calls (correlation_id)
  where correlation_id is not null;

create table if not exists public.maps_provider_calls (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  correlation_id text,
  function_name text not null,
  service text not null check (service in ('routes', 'geocoding', 'places')),
  sku text,
  call_purpose text not null,
  cache_outcome text not null default 'provider'
    check (cache_outcome in ('provider', 'cache_hit', 'existing_coordinates', 'deduplicated')),
  retry_index integer not null default 0 check (retry_index >= 0),
  probe_count integer not null default 1 check (probe_count >= 0),
  origin_hash text,
  destination_hash text,
  time_bucket timestamptz,
  latency_ms integer not null check (latency_ms >= 0),
  status text not null check (status in ('success', 'provider_error', 'transport_error', 'cancelled', 'avoided')),
  http_status integer,
  error_class text,
  estimated_cost_usd numeric(20, 9),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now()
);

create index if not exists maps_provider_calls_occurred_at_idx
  on public.maps_provider_calls (occurred_at desc);
create index if not exists maps_provider_calls_service_idx
  on public.maps_provider_calls (service, occurred_at desc);

create table if not exists public.app_ai_outcomes (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  correlation_id text,
  request_id text,
  function_name text not null,
  capability text not null,
  outcome text not null
    check (outcome in ('deterministic', 'provider_backed', 'cache_hit', 'disabled', 'budget_blocked', 'failed')),
  provider_call_count integer not null default 0 check (provider_call_count >= 0),
  policy_mode text,
  policy_version text,
  channel text,
  device text,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now()
);

create index if not exists app_ai_outcomes_occurred_at_idx
  on public.app_ai_outcomes (occurred_at desc);

create or replace function public.prevent_cost_ledger_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

create trigger ai_provider_calls_append_only
  before update or delete on public.ai_provider_calls
  for each row execute function public.prevent_cost_ledger_mutation();
create trigger maps_provider_calls_append_only
  before update or delete on public.maps_provider_calls
  for each row execute function public.prevent_cost_ledger_mutation();
create trigger app_ai_outcomes_append_only
  before update or delete on public.app_ai_outcomes
  for each row execute function public.prevent_cost_ledger_mutation();

create table if not exists public.cost_model_pricing (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model text not null,
  input_per_million_usd numeric(20, 9) not null check (input_per_million_usd >= 0),
  cached_input_per_million_usd numeric(20, 9),
  output_per_million_usd numeric(20, 9) not null check (output_per_million_usd >= 0),
  thought_per_million_usd numeric(20, 9),
  currency text not null default 'USD',
  effective_from date not null,
  effective_to date,
  source text not null,
  created_at timestamptz not null default now(),
  unique (provider, model, effective_from),
  check (effective_to is null or effective_to >= effective_from)
);

insert into public.cost_model_pricing (
  provider,
  model,
  input_per_million_usd,
  cached_input_per_million_usd,
  output_per_million_usd,
  thought_per_million_usd,
  effective_from,
  source
) values
  ('gemini', 'gemini-2.5-flash-lite', 0.10, null, 0.40, 0.40, '2026-07-01', 'Google contract pricing export'),
  ('gemini', 'gemini-2.5-flash', 0.30, null, 2.50, 2.50, '2026-07-01', 'Google contract pricing export'),
  ('gemini', 'gemini-3.5-flash', 1.50, null, 9.00, 9.00, '2026-07-01', 'Google contract pricing export'),
  ('openai', 'gpt-4o-mini', 0.15, null, 0.60, null, '2026-07-01', 'Published list price'),
  ('openai', 'gpt-4.1-nano', 0.10, null, 0.40, null, '2026-07-01', 'Published list price'),
  ('openai', 'gpt-4o', 2.50, null, 10.00, null, '2026-07-01', 'Published list price'),
  ('anthropic', 'claude-haiku-4-5', 0.80, null, 4.00, null, '2026-07-01', 'Published list price'),
  ('anthropic', 'claude-sonnet-4-5', 3.00, null, 15.00, null, '2026-07-01', 'Published list price'),
  ('anthropic', 'claude-opus-4-5', 15.00, null, 75.00, null, '2026-07-01', 'Published list price')
on conflict (provider, model, effective_from) do update set
  input_per_million_usd = excluded.input_per_million_usd,
  cached_input_per_million_usd = excluded.cached_input_per_million_usd,
  output_per_million_usd = excluded.output_per_million_usd,
  thought_per_million_usd = excluded.thought_per_million_usd,
  source = excluded.source;

create table if not exists public.billing_imports (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('google_detailed_export', 'google_csv')),
  source_name text not null,
  source_checksum text not null unique,
  period_start date not null,
  period_end date not null,
  billing_state text not null default 'provisional'
    check (billing_state in ('provisional', 'finalized')),
  row_count integer not null check (row_count >= 0),
  imported_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  check (period_end >= period_start)
);

create table if not exists public.billing_line_items (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.billing_imports(id) on delete restrict,
  usage_date date not null,
  project_id text not null,
  project_name text,
  service_id text,
  service_name text not null,
  sku_id text,
  sku_name text not null,
  usage_quantity numeric(30, 9),
  usage_unit text,
  subtotal_usd numeric(20, 9) not null,
  credits_usd numeric(20, 9) not null default 0,
  cost_usd numeric(20, 9) not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (import_id, usage_date, project_id, service_name, sku_name, usage_unit)
);

create index if not exists billing_line_items_usage_date_idx
  on public.billing_line_items (usage_date desc);

create table if not exists public.cost_observability_sources (
  function_name text primary key,
  capability text not null,
  provider_ledger_enabled boolean not null default false,
  legacy_usage_enabled boolean not null default false,
  verified_at timestamptz,
  notes text
);

insert into public.cost_observability_sources (function_name, capability, legacy_usage_enabled) values
  ('ai-assistant', 'assistant', true),
  ('ai-agent-shadow', 'assistant-shadow', false),
  ('analyze-prep', 'event-prep', false),
  ('enrich-event', 'event-enrichment', true),
  ('extract-recipe-content', 'recipe-extraction', false),
  ('generate-briefing', 'briefing', false),
  ('meal-planner-assistant', 'meal-planning', false),
  ('normalize-grocery-items', 'grocery-normalization', false),
  ('recipe-edit-assistant', 'recipe-editing', false),
  ('scan-gmail-inbox', 'gmail-scan', true),
  ('scan-travel-emails', 'travel-email-scan', false),
  ('sms-webhook', 'sms-assistant', false)
on conflict (function_name) do update set
  capability = excluded.capability,
  legacy_usage_enabled = excluded.legacy_usage_enabled;

update public.cost_observability_sources
set provider_ledger_enabled = true;

create table if not exists public.cost_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  status text not null check (status in ('verified', 'provisional', 'incomplete', 'error')),
  ai_token_variance_pct numeric(12, 6),
  maps_usage_variance_pct numeric(12, 6),
  cost_variance_usd numeric(20, 9),
  unmatched_app_rows bigint not null default 0,
  unmatched_billing_rows bigint not null default 0,
  details jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now(),
  check (period_end >= period_start)
);

alter table public.ai_provider_calls enable row level security;
alter table public.maps_provider_calls enable row level security;
alter table public.app_ai_outcomes enable row level security;
alter table public.cost_model_pricing enable row level security;
alter table public.billing_imports enable row level security;
alter table public.billing_line_items enable row level security;
alter table public.cost_observability_sources enable row level security;
alter table public.cost_reconciliation_runs enable row level security;

create policy "service role manages ai provider calls"
  on public.ai_provider_calls for all to service_role using (true) with check (true);
create policy "service role manages maps provider calls"
  on public.maps_provider_calls for all to service_role using (true) with check (true);
create policy "service role manages app ai outcomes"
  on public.app_ai_outcomes for all to service_role using (true) with check (true);
create policy "service role manages cost pricing"
  on public.cost_model_pricing for all to service_role using (true) with check (true);
create policy "service role manages billing imports"
  on public.billing_imports for all to service_role using (true) with check (true);
create policy "service role manages billing line items"
  on public.billing_line_items for all to service_role using (true) with check (true);
create policy "service role manages observability sources"
  on public.cost_observability_sources for all to service_role using (true) with check (true);
create policy "service role manages reconciliation runs"
  on public.cost_reconciliation_runs for all to service_role using (true) with check (true);

create or replace function public.get_cost_dashboard_summary(
  p_start timestamptz,
  p_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if p_start is null or p_end is null or p_start >= p_end then
    raise exception 'invalid dashboard period';
  end if;
  if p_end - p_start > interval '366 days' then
    raise exception 'dashboard period cannot exceed 366 days';
  end if;

  with usage_rows as (
    select
      u.function_name,
      u.provider,
      u.model,
      greatest(coalesce(u.input_tokens, 0), 0)::bigint as input_tokens,
      greatest(coalesce(u.cached_input_tokens, 0), 0)::bigint as cached_input_tokens,
      greatest(coalesce(u.output_tokens, 0), 0)::bigint as output_tokens,
      coalesce(u.cached, false) as cached,
      u.created_at,
      pricing.input_per_million_usd,
      pricing.output_per_million_usd,
      pricing.model is not null as has_pricing
    from public.ai_usage_log u
    left join lateral (
      select p.*
      from public.cost_model_pricing p
      where p.provider = u.provider
        and p.model = u.model
        and p.effective_from <= u.created_at::date
        and (p.effective_to is null or p.effective_to >= u.created_at::date)
      order by p.effective_from desc
      limit 1
    ) pricing on true
    where u.created_at >= p_start
      and u.created_at < p_end
  ),
  billable_usage as (
    select
      *,
      case
        when cached then 0::numeric
        when has_pricing then (
          input_tokens * input_per_million_usd
          + output_tokens * output_per_million_usd
        ) / 1000000::numeric
        else null
      end as estimated_cost_usd
    from usage_rows
  ),
  period_totals as (
    select
      count(*) filter (where not cached)::bigint as calls,
      coalesce(sum(input_tokens) filter (where not cached), 0)::bigint as input_tokens,
      coalesce(sum(cached_input_tokens) filter (where not cached), 0)::bigint as cached_input_tokens,
      coalesce(sum(output_tokens) filter (where not cached), 0)::bigint as output_tokens,
      count(*) filter (where cached)::bigint as deduplicated_calls,
      coalesce(sum(estimated_cost_usd), 0)::numeric as estimated_cost_usd,
      count(*) filter (where not cached and not has_pricing)::bigint as unknown_pricing_calls
    from billable_usage
  ),
  today_totals as (
    select
      count(*) filter (where not cached)::bigint as calls,
      coalesce(sum(input_tokens) filter (where not cached), 0)::bigint as input_tokens,
      coalesce(sum(cached_input_tokens) filter (where not cached), 0)::bigint as cached_input_tokens,
      coalesce(sum(output_tokens) filter (where not cached), 0)::bigint as output_tokens,
      count(*) filter (where cached)::bigint as deduplicated_calls,
      coalesce(sum(estimated_cost_usd), 0)::numeric as estimated_cost_usd
    from billable_usage
    where created_at >= date_trunc('day', now())
  ),
  day_series as (
    select generate_series(
      greatest(date_trunc('day', p_start), date_trunc('day', p_end) - interval '29 days'),
      date_trunc('day', p_end - interval '1 microsecond'),
      interval '1 day'
    ) as day
  ),
  daily as (
    select
      d.day::date as date,
      count(b.created_at) filter (where not coalesce(b.cached, false))::bigint as calls,
      coalesce(sum(b.input_tokens + b.output_tokens) filter (where not b.cached), 0)::bigint as tokens,
      coalesce(sum(b.estimated_cost_usd), 0)::numeric as estimated_cost_usd
    from day_series d
    left join billable_usage b
      on b.created_at >= d.day
      and b.created_at < d.day + interval '1 day'
    group by d.day
    order by d.day
  ),
  by_function as (
    select
      function_name,
      count(*) filter (where not cached)::bigint as calls,
      coalesce(sum(input_tokens + output_tokens) filter (where not cached), 0)::bigint as tokens,
      coalesce(sum(estimated_cost_usd), 0)::numeric as estimated_cost_usd
    from billable_usage
    group by function_name
  ),
  coverage as (
    select
      count(*)::integer as known_paths,
      count(*) filter (where legacy_usage_enabled)::integer as logged_paths,
      count(*) filter (where provider_ledger_enabled)::integer as provider_logged_paths,
      round(
        100 * count(*) filter (where legacy_usage_enabled)::numeric
        / nullif(count(*), 0),
        1
      ) as coverage_pct,
      round(
        100 * count(*) filter (where provider_ledger_enabled)::numeric
        / nullif(count(*), 0),
        1
      ) as provider_coverage_pct
    from public.cost_observability_sources
  ),
  billing as (
    select
      count(*)::bigint as line_count,
      coalesce(sum(li.cost_usd), 0)::numeric as actual_cost_usd,
      max(li.usage_date) as latest_usage_date,
      bool_and(i.billing_state = 'finalized') as finalized
    from public.billing_line_items li
    join public.billing_imports i on i.id = li.import_id
    where li.usage_date >= p_start::date
      and li.usage_date < p_end::date
  ),
  latest_reconciliation as (
    select r.*
    from public.cost_reconciliation_runs r
    where r.period_start <= p_start::date
      and r.period_end >= (p_end - interval '1 microsecond')::date
    order by r.completed_at desc
    limit 1
  )
  select jsonb_build_object(
    'trust', jsonb_build_object(
      'status', case
        when c.coverage_pct < 100 then 'incomplete'
        when pt.unknown_pricing_calls > 0 then 'incomplete'
        when lr.status = 'verified' then 'verified'
        when b.line_count > 0 then 'provisional'
        else 'incomplete'
      end,
      'coverage_pct', coalesce(c.coverage_pct, 0),
      'known_paths', coalesce(c.known_paths, 0),
      'logged_paths', coalesce(c.logged_paths, 0),
      'provider_logged_paths', coalesce(c.provider_logged_paths, 0),
      'provider_coverage_pct', coalesce(c.provider_coverage_pct, 0),
      'unknown_pricing_calls', pt.unknown_pricing_calls,
      'application_fresh_at', (select max(created_at) from usage_rows),
      'billing_fresh_through', b.latest_usage_date,
      'billing_finalized', coalesce(b.finalized, false),
      'reconciliation_variance_usd', lr.cost_variance_usd,
      'reconciled_at', lr.completed_at
    ),
    'today', to_jsonb(tt),
    'period', to_jsonb(pt),
    'daily', coalesce((select jsonb_agg(to_jsonb(d) order by d.date) from daily d), '[]'::jsonb),
    'by_function', coalesce((select jsonb_agg(to_jsonb(f) order by f.calls desc) from by_function f), '[]'::jsonb),
    'billing', jsonb_build_object(
      'actual_cost_usd', case when b.line_count > 0 then b.actual_cost_usd else null end,
      'line_count', b.line_count,
      'finalized', coalesce(b.finalized, false),
      'latest_usage_date', b.latest_usage_date
    )
  )
  into v_result
  from period_totals pt
  cross join today_totals tt
  cross join coverage c
  cross join billing b
  left join latest_reconciliation lr on true;

  return v_result;
end;
$$;

revoke all on function public.get_cost_dashboard_summary(timestamptz, timestamptz) from public;
grant execute on function public.get_cost_dashboard_summary(timestamptz, timestamptz) to anon, authenticated;
