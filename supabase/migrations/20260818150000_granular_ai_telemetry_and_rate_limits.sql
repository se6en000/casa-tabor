-- Migration: 20260818150000_granular_ai_telemetry_and_rate_limits.sql
-- Adds pricing for embeddings, registers missing AI paths, and enhances get_cost_dashboard_summary
-- with 24-hour hourly burn rates, capability breakdown, model distribution, and rate-limit tracking.

-- 1. Ensure pricing exists for embedding models and latest models in cost_model_pricing
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
  ('gemini', 'gemini-embedding-001', 0.02, null, 0.00, 0.00, '2026-07-01', 'Google list pricing'),
  ('gemini', 'text-embedding-004', 0.02, null, 0.00, 0.00, '2026-07-01', 'Google list pricing'),
  ('gemini', 'gemini-3.6-flash', 1.50, null, 9.00, 9.00, '2026-07-01', 'Google list pricing'),
  ('gemini', 'gemini-2.0-flash', 0.30, null, 2.50, 2.50, '2026-07-01', 'Google list pricing')
on conflict (provider, model, effective_from) do update set
  input_per_million_usd = excluded.input_per_million_usd,
  cached_input_per_million_usd = excluded.cached_input_per_million_usd,
  output_per_million_usd = excluded.output_per_million_usd,
  thought_per_million_usd = excluded.thought_per_million_usd,
  source = excluded.source;

-- 2. Register index-family-data and other active sources in cost_observability_sources
insert into public.cost_observability_sources (function_name, capability, provider_ledger_enabled, legacy_usage_enabled, notes) values
  ('index-family-data', 'family-data-index', true, false, 'Vector embeddings background indexer'),
  ('scan-travel-emails', 'travel-email-scan', true, false, 'Travel confirmation parser'),
  ('ai-agent-shadow', 'assistant-shadow', true, false, 'Autonomous shadow evaluation')
on conflict (function_name) do update set
  capability = excluded.capability,
  provider_ledger_enabled = true;

-- 3. Replace get_cost_dashboard_summary with high-performance granular hourly & capability breakdowns
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
  v_tz constant text := 'America/New_York';
  v_today_start timestamptz;
  v_day_series_start timestamptz;
  v_day_series_end timestamptz;
  v_hourly_series_start timestamptz;
  v_hourly_series_end timestamptz;
  v_circuit_breaker jsonb;
begin
  if p_start is null or p_end is null or p_start >= p_end then
    raise exception 'invalid dashboard period';
  end if;
  if p_end - p_start > interval '366 days' then
    raise exception 'dashboard period cannot exceed 366 days';
  end if;

  -- Time boundaries in household local timezone
  v_today_start := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_day_series_start := greatest(
    date_trunc('day', p_start at time zone v_tz) at time zone v_tz,
    date_trunc('day', p_end at time zone v_tz) at time zone v_tz - interval '29 days'
  );
  v_day_series_end := date_trunc('day', (p_end - interval '1 microsecond') at time zone v_tz) at time zone v_tz;

  v_hourly_series_start := date_trunc('hour', now() at time zone v_tz) at time zone v_tz - interval '23 hours';
  v_hourly_series_end := date_trunc('hour', now() at time zone v_tz) at time zone v_tz;

  select value into v_circuit_breaker
  from public.settings
  where key = 'ai_circuit_breaker'
  limit 1;

  with usage_rows as (
    select
      c.id,
      c.function_name,
      coalesce(nullif(c.capability, ''), 'general') as capability,
      coalesce(nullif(c.traffic_class, ''), 'background') as traffic_class,
      coalesce(nullif(c.lane, ''), 'default') as lane,
      c.provider,
      c.model,
      greatest(coalesce(c.input_tokens, 0), 0)::bigint as input_tokens,
      greatest(coalesce(c.cached_input_tokens, 0), 0)::bigint as cached_input_tokens,
      greatest(coalesce(c.output_tokens, 0), 0)::bigint as output_tokens,
      greatest(coalesce(c.latency_ms, 0), 0)::integer as latency_ms,
      c.status,
      c.http_status,
      c.error_class,
      c.occurred_at as created_at,
      date_trunc('day', c.occurred_at at time zone v_tz) at time zone v_tz as usage_day,
      date_trunc('hour', c.occurred_at at time zone v_tz) at time zone v_tz as usage_hour,
      pricing.input_per_million_usd,
      pricing.output_per_million_usd,
      pricing.model is not null as has_pricing
    from public.ai_provider_calls c
    left join lateral (
      select p.*
      from public.cost_model_pricing p
      where p.provider = c.provider
        and p.model = c.model
        and p.effective_from <= c.occurred_at::date
        and (p.effective_to is null or p.effective_to >= c.occurred_at::date)
      order by p.effective_from desc
      limit 1
    ) pricing on true
    where c.occurred_at >= p_start
      and c.occurred_at < p_end
  ),
  billable_usage as (
    select
      *,
      case
        when status = 'success' and has_pricing then (
          input_tokens * input_per_million_usd
          + output_tokens * output_per_million_usd
        ) / 1000000::numeric
        else 0::numeric
      end as estimated_cost_usd
    from usage_rows
  ),
  period_totals as (
    select
      count(*) filter (where status = 'success')::bigint as calls,
      coalesce(sum(input_tokens) filter (where status = 'success'), 0)::bigint as input_tokens,
      coalesce(sum(cached_input_tokens) filter (where status = 'success'), 0)::bigint as cached_input_tokens,
      coalesce(sum(output_tokens) filter (where status = 'success'), 0)::bigint as output_tokens,
      0::bigint as deduplicated_calls,
      coalesce(sum(estimated_cost_usd), 0)::numeric as estimated_cost_usd,
      count(*) filter (where status = 'success' and not has_pricing)::bigint as unknown_pricing_calls
    from billable_usage
  ),
  today_totals as (
    select
      count(*) filter (where status = 'success')::bigint as calls,
      coalesce(sum(input_tokens) filter (where status = 'success'), 0)::bigint as input_tokens,
      coalesce(sum(cached_input_tokens) filter (where status = 'success'), 0)::bigint as cached_input_tokens,
      coalesce(sum(output_tokens) filter (where status = 'success'), 0)::bigint as output_tokens,
      0::bigint as deduplicated_calls,
      coalesce(sum(estimated_cost_usd), 0)::numeric as estimated_cost_usd
    from billable_usage
    where created_at >= v_today_start
  ),
  day_series as (
    select generate_series(
      v_day_series_start,
      v_day_series_end,
      interval '1 day'
    ) as day
  ),
  daily_agg as (
    select
      usage_day,
      count(*) filter (where status = 'success')::bigint as calls,
      coalesce(sum(input_tokens + output_tokens) filter (where status = 'success'), 0)::bigint as tokens,
      coalesce(sum(estimated_cost_usd), 0)::numeric as estimated_cost_usd
    from billable_usage
    group by usage_day
  ),
  daily as (
    select
      (d.day at time zone v_tz)::date as date,
      coalesce(a.calls, 0)::bigint as calls,
      coalesce(a.tokens, 0)::bigint as tokens,
      coalesce(a.estimated_cost_usd, 0)::numeric as estimated_cost_usd
    from day_series d
    left join daily_agg a on a.usage_day = d.day
    order by d.day
  ),
  hour_series as (
    select generate_series(
      v_hourly_series_start,
      v_hourly_series_end,
      interval '1 hour'
    ) as hour_start
  ),
  hourly_agg as (
    select
      usage_hour,
      count(*) filter (where status = 'success')::bigint as calls,
      count(*) filter (where status = 'success' and traffic_class = 'user')::bigint as user_calls,
      count(*) filter (where status = 'success' and traffic_class != 'user')::bigint as background_calls,
      count(*) filter (where status != 'success' or coalesce(http_status, 200) >= 400)::bigint as error_count,
      coalesce(sum(input_tokens + output_tokens) filter (where status = 'success'), 0)::bigint as tokens,
      coalesce(sum(estimated_cost_usd), 0)::numeric as estimated_cost_usd
    from billable_usage
    where created_at >= v_hourly_series_start
    group by usage_hour
  ),
  hourly as (
    select
      h.hour_start,
      to_char(h.hour_start at time zone v_tz, 'HH12:MI AM') as hour_label,
      extract(hour from h.hour_start at time zone v_tz)::integer as hour_num,
      coalesce(a.calls, 0)::bigint as calls,
      coalesce(a.user_calls, 0)::bigint as user_calls,
      coalesce(a.background_calls, 0)::bigint as background_calls,
      coalesce(a.error_count, 0)::bigint as error_count,
      coalesce(a.tokens, 0)::bigint as tokens,
      coalesce(a.estimated_cost_usd, 0)::numeric as estimated_cost_usd
    from hour_series h
    left join hourly_agg a on a.usage_hour = h.hour_start
    order by h.hour_start
  ),
  by_function as (
    select
      function_name,
      count(*) filter (where status = 'success')::bigint as calls,
      coalesce(sum(input_tokens + output_tokens) filter (where status = 'success'), 0)::bigint as tokens,
      coalesce(sum(estimated_cost_usd), 0)::numeric as estimated_cost_usd
    from billable_usage
    group by function_name
    order by calls desc
  ),
  by_capability as (
    select
      capability,
      max(function_name) as sample_function,
      count(*) filter (where status = 'success')::bigint as calls,
      count(*) filter (where traffic_class = 'user')::bigint as user_calls,
      count(*) filter (where traffic_class != 'user')::bigint as background_calls,
      coalesce(sum(input_tokens + output_tokens) filter (where status = 'success'), 0)::bigint as tokens,
      coalesce(sum(estimated_cost_usd), 0)::numeric as estimated_cost_usd,
      round(coalesce(avg(latency_ms) filter (where latency_ms > 0 and status = 'success'), 0))::integer as avg_latency_ms,
      count(*) filter (where status != 'success' or coalesce(http_status, 200) >= 400)::bigint as error_count
    from billable_usage
    group by capability
    order by calls desc
  ),
  by_model as (
    select
      provider,
      model,
      count(*) filter (where status = 'success')::bigint as calls,
      coalesce(sum(input_tokens + output_tokens) filter (where status = 'success'), 0)::bigint as tokens,
      coalesce(sum(estimated_cost_usd), 0)::numeric as estimated_cost_usd
    from billable_usage
    group by provider, model
    order by calls desc
  ),
  by_traffic_class as (
    select
      traffic_class,
      count(*) filter (where status = 'success')::bigint as calls,
      coalesce(sum(input_tokens + output_tokens) filter (where status = 'success'), 0)::bigint as tokens,
      coalesce(sum(estimated_cost_usd), 0)::numeric as estimated_cost_usd
    from billable_usage
    group by traffic_class
    order by calls desc
  ),
  rate_limit_stats as (
    select
      count(*) filter (where created_at >= now() - interval '15 minutes' and (http_status = 429 or error_class = 'http_429'))::bigint as throttled_15m,
      count(*) filter (where created_at >= now() - interval '24 hours' and (http_status = 429 or error_class = 'http_429'))::bigint as throttled_24h,
      count(*) filter (where created_at >= now() - interval '1 minute')::bigint as rpm_1m
    from billable_usage
  ),
  recent_429s as (
    select
      created_at as occurred_at,
      function_name,
      model,
      error_class,
      latency_ms
    from billable_usage
    where http_status = 429 or error_class = 'http_429'
    order by created_at desc
    limit 5
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
    'hourly', coalesce((select jsonb_agg(to_jsonb(h) order by h.hour_start) from hourly h), '[]'::jsonb),
    'by_function', coalesce((select jsonb_agg(to_jsonb(f) order by f.calls desc) from by_function f), '[]'::jsonb),
    'by_capability', coalesce((select jsonb_agg(to_jsonb(cap) order by cap.calls desc) from by_capability cap), '[]'::jsonb),
    'by_model', coalesce((select jsonb_agg(to_jsonb(m) order by m.calls desc) from by_model m), '[]'::jsonb),
    'by_traffic_class', coalesce((select jsonb_agg(to_jsonb(tc) order by tc.calls desc) from by_traffic_class tc), '[]'::jsonb),
    'rate_limit_health', jsonb_build_object(
      'status', case
        when (select throttled_15m from rate_limit_stats) > 0 then 'throttled'
        when (select rpm_1m from rate_limit_stats) >= 12 then 'warning'
        else 'healthy'
      end,
      'throttled_15m_count', (select throttled_15m from rate_limit_stats),
      'throttled_24h_count', (select throttled_24h from rate_limit_stats),
      'rpm_last_minute', (select rpm_1m from rate_limit_stats),
      'recent_throttles', coalesce((select jsonb_agg(to_jsonb(r)) from recent_429s r), '[]'::jsonb)
    ),
    'circuit_breaker', coalesce(v_circuit_breaker, jsonb_build_object(
      'paused', false,
      'pause_scope', 'none',
      'pause_until', null,
      'daily_cost_cap_usd', 2.00
    )),
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
