-- Settings V2 › Advanced (canvas 47d; Jake, Oct 5: "label every AI call by who caused it — yes"). Each AI call says who
-- caused it — the family, the nightly checks, or Claude's testing — and Usage and cost reads it by day, by who, by
-- feature. Calls from before the label are classed by their correlation id (the test scripts name themselves).

alter table public.ai_provider_calls add column if not exists caused_by text
  check (caused_by is null or caused_by in ('family', 'nightly', 'testing'));

create or replace function public.ai_call_cause(p_caused_by text, p_correlation_id text)
returns text language sql immutable as $$
  select coalesce(p_caused_by, case
    when p_correlation_id ~ '^nightly-check' then 'nightly'
    when p_correlation_id ~ '^(which-live|plan-talk-eval|route-eval|quick-eval|aside-eval|grocery-voice-eval|[a-z-]*-eval)' then 'testing'
    else 'family' end)
$$;

create or replace function public.ai_call_feature(p_function text)
returns text language sql immutable as $$
  select case
    when p_function = 'ai-assistant' then 'Assistant'
    when p_function in ('email-reader', 'scan-gmail-inbox', 'scan-travel-emails', 'scan-document-events') then 'Email reader'
    when p_function = 'enrich-event' then 'Enrichment'
    when p_function in ('index-family-data', 'memory-learner') then 'Memory'
    when p_function = 'todos' then 'To-dos'
    else 'Other' end
$$;

-- What Usage and cost shows: today, the last p_days by day and by who, the period by feature, and what one assistant
-- question costs. Thinking is billed as output (it wasn't counted in the old dashboard).
create or replace function public.get_settings_usage(p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_tz constant text := 'America/New_York';
  v_days integer := least(greatest(coalesce(p_days, 7), 1), 60);
  v_today date := (now() at time zone v_tz)::date;
  v_start timestamptz := ((v_today - (v_days - 1))::timestamp at time zone v_tz);
  v_result jsonb;
begin
  with calls as (
    select (c.occurred_at at time zone v_tz)::date as day,
      public.ai_call_cause(c.caused_by, c.correlation_id) as who,
      public.ai_call_feature(c.function_name) as feature,
      c.call_purpose, c.status, c.model,
      greatest(coalesce(c.input_tokens, 0), 0) as input_tokens,
      greatest(coalesce(c.cached_input_tokens, 0), 0) as cached_tokens,
      greatest(coalesce(c.output_tokens, 0), 0) + greatest(coalesce(c.thought_tokens, 0), 0) as output_tokens,
      p.model is not null as priced,
      case when c.status = 'success' and p.model is not null
        then (greatest(coalesce(c.input_tokens, 0), 0) * p.input_per_million_usd
          + (greatest(coalesce(c.output_tokens, 0), 0) + greatest(coalesce(c.thought_tokens, 0), 0)) * p.output_per_million_usd) / 1000000::numeric
        else 0::numeric end as usd
    from public.ai_provider_calls c
    left join lateral (
      select * from public.cost_model_pricing p
      where p.provider = c.provider and p.model = c.model and p.effective_from <= c.occurred_at::date
        and (p.effective_to is null or p.effective_to >= c.occurred_at::date)
      order by p.effective_from desc limit 1
    ) p on true
    where c.occurred_at >= v_start
  ),
  days as (select generate_series(v_today - (v_days - 1), v_today, interval '1 day')::date as day)
  select jsonb_build_object(
    'today', (select jsonb_build_object(
        'usd', coalesce(sum(usd), 0),
        'family', coalesce(sum(usd) filter (where who = 'family'), 0),
        'nightly', coalesce(sum(usd) filter (where who = 'nightly'), 0),
        'testing', coalesce(sum(usd) filter (where who = 'testing'), 0),
        'calls', count(*)) from calls where day = v_today),
    'period_usd', (select coalesce(sum(usd), 0) from calls),
    'days', (select jsonb_agg(jsonb_build_object(
        'date', d.day,
        'family', coalesce((select sum(usd) from calls c where c.day = d.day and c.who = 'family'), 0),
        'nightly', coalesce((select sum(usd) from calls c where c.day = d.day and c.who = 'nightly'), 0),
        'testing', coalesce((select sum(usd) from calls c where c.day = d.day and c.who = 'testing'), 0)) order by d.day) from days d),
    'features', (select coalesce(jsonb_agg(f order by (f->>'usd')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object('feature', feature, 'usd', sum(usd), 'calls', count(*)) f from calls group by feature) x),
    'question', (select jsonb_build_object(
        'rounds', count(*),
        'avg_input', coalesce(round(avg(input_tokens)), 0),
        'reused_share', case when sum(input_tokens) > 0 then round(sum(cached_tokens)::numeric / sum(input_tokens), 3) else 0 end,
        'avg_usd', coalesce(avg(usd), 0))
      from calls where call_purpose = 'full-ai' and status = 'success'),
    'models', (select coalesce(jsonb_agg(jsonb_build_object('feature', feature, 'model', model, 'calls', n) order by n desc), '[]'::jsonb) from (
        select distinct on (feature) feature, model, count(*) over (partition by feature, model) n
        from calls where status = 'success' order by feature, count(*) over (partition by feature, model) desc) m),
    'unpriced_calls', (select count(*) from calls where status = 'success' and not priced),
    'maps', (select jsonb_build_object('calls', count(*)) from public.maps_provider_calls m where m.occurred_at >= v_start)
  ) into v_result;
  return v_result;
end;
$$;

-- Checks (canvas 47d): the nightly results, newest first.
create or replace function public.get_nightly_checks(p_days integer default 14)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('run_date', run_date, 'kind', kind, 'ok', ok, 'summary', summary, 'details', details, 'created_at', created_at)
    order by created_at desc), '[]'::jsonb)
  from public.nightly_checks
  where run_date >= ((now() at time zone 'America/New_York')::date - least(greatest(coalesce(p_days, 14), 1), 60))
$$;

grant execute on function public.get_settings_usage(integer) to anon, authenticated;
grant execute on function public.get_nightly_checks(integer) to anon, authenticated;

-- Settings › Limits and health: the caps change through one merge, like pausing does (never a whole-value overwrite
-- that could undo a trip the breaker wrote in between).
create or replace function public.set_ai_circuit_breaker_caps(p_hourly_usd numeric, p_daily_usd numeric)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v jsonb;
begin
  if p_hourly_usd is null or p_daily_usd is null or p_hourly_usd <= 0 or p_daily_usd <= 0 or p_hourly_usd > 100 or p_daily_usd > 500 then
    raise exception 'caps must be between $1 and $100 an hour, $1 and $500 a day';
  end if;
  update public.settings
    set value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
      'hourly_cost_cap_usd', p_hourly_usd, 'daily_cost_cap_usd', p_daily_usd,
      'caps_note', format('Set in Settings %s: $%s/h, $%s/day', (now() at time zone 'America/New_York')::date, p_hourly_usd, p_daily_usd)),
      updated_at = now()
    where key = 'ai_circuit_breaker'
    returning value into v;
  return v;
end;
$$;
grant execute on function public.set_ai_circuit_breaker_caps(numeric, numeric) to anon, authenticated;
