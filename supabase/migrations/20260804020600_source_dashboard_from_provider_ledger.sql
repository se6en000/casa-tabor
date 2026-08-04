-- Fix: get_cost_dashboard_summary's Today/Period/daily-chart/by-function
-- numbers were sourced entirely from public.ai_usage_log, a legacy table
-- that only 3 of 12 AI-calling functions write to (ai-assistant,
-- enrich-event, scan-gmail-inbox). Every other function (generate-briefing,
-- ai-agent-shadow, analyze-prep, recipe tooling, etc.) has been fully
-- migrated to createTrackedProviderFetch, which writes exclusively to
-- public.ai_provider_calls. Regenerating the daily briefing (or invoking
-- any of the 9 migrated functions) therefore never moved the "Today" /
-- "Provider-backed requests" counters, even though the Billing Confidence
-- card's "Application tracking" gate reported 100% coverage based on
-- cost_observability_sources.provider_ledger_enabled -- which is true for
-- all functions and was misleading given the numeric aggregates ignored
-- ai_provider_calls entirely.
--
-- ai_provider_calls is the complete, superset ledger: the 3 legacy
-- functions already dual-write to both tables, so switching the numeric
-- source to ai_provider_calls (filtered to status = 'success') captures
-- every function's real usage with no double counting, since ai_usage_log
-- rows are a separate additional log, not derived from ai_provider_calls.
--
-- ai_provider_calls has no "cached / deduplicated call" concept (a cache
-- hit skips the fetch entirely, so no row is written at all), unlike
-- ai_usage_log's `cached` boolean used for enrich-event's early-exit
-- dedup markers. The `deduplicated_calls` field is preserved in the
-- response shape for API stability (it is not currently rendered in the
-- UI) but will now always be 0.

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
begin
  if p_start is null or p_end is null or p_start >= p_end then
    raise exception 'invalid dashboard period';
  end if;
  if p_end - p_start > interval '366 days' then
    raise exception 'dashboard period cannot exceed 366 days';
  end if;

  -- Start of "today" in the household's local timezone, expressed as an
  -- absolute instant (timestamptz), not the database session timezone.
  v_today_start := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_day_series_start := greatest(
    date_trunc('day', p_start at time zone v_tz) at time zone v_tz,
    date_trunc('day', p_end at time zone v_tz) at time zone v_tz - interval '29 days'
  );
  v_day_series_end := date_trunc('day', (p_end - interval '1 microsecond') at time zone v_tz) at time zone v_tz;

  with usage_rows as (
    select
      c.function_name,
      c.provider,
      c.model,
      greatest(coalesce(c.input_tokens, 0), 0)::bigint as input_tokens,
      greatest(coalesce(c.cached_input_tokens, 0), 0)::bigint as cached_input_tokens,
      greatest(coalesce(c.output_tokens, 0), 0)::bigint as output_tokens,
      false as cached,
      c.occurred_at as created_at,
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
      and c.status = 'success'
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
    where created_at >= v_today_start
  ),
  day_series as (
    select generate_series(
      v_day_series_start,
      v_day_series_end,
      interval '1 day'
    ) as day
  ),
  daily as (
    select
      (d.day at time zone v_tz)::date as date,
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
