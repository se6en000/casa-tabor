create or replace function public.evaluate_system_health()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_now timestamptz := now();
  v_tz constant text := 'America/New_York';
  v_today_start timestamptz := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_cfg jsonb := public.ai_circuit_breaker_config();
  v_since_resume timestamptz := coalesce((v_cfg->>'resumed_at')::timestamptz, '-infinity'::timestamptz);
  v_hour_start timestamptz;
  v_day_start timestamptz;
  v_hourly_cost_cap numeric := (v_cfg->>'hourly_cost_cap_usd')::numeric;
  v_daily_cost_cap numeric := (v_cfg->>'daily_cost_cap_usd')::numeric;
  v_hourly_token_cap bigint := (v_cfg->>'hourly_token_cap')::bigint;
  v_hourly_call_cap bigint := (v_cfg->>'hourly_call_cap')::bigint;
  v_paused boolean;
  v_spend record;
  v_breaches text[] := '{}';
  v_elevated text[] := '{}';
  v_user_heavy boolean;
  v_scope text;
  v_tripped boolean := false;
  v_open_keys text[] := '{}';
  v_new_critical jsonb := '[]'::jsonb;
  v_feed_calls bigint;
  v_feed_ms double precision;
  v_prev record;
  v_feed_mean_ms numeric;
  v_http_total bigint;
  v_http_errors bigint;
  v_http_timeouts bigint;
  v_cron record;
  v_client_errors_hour bigint;
  v_alert record;
  v_result jsonb;
begin
  v_hour_start := greatest(v_now - interval '1 hour', v_since_resume);
  v_day_start := greatest(v_today_start, v_since_resume);
  v_paused := coalesce((v_cfg->>'paused')::boolean, false)
    and ((v_cfg->>'pause_until') is null or (v_cfg->>'pause_until')::timestamptz > v_now);

  -- 1. AI spend / runaway detection ------------------------------------------------
  select * into v_spend from public.ai_spend_window(v_hour_start, v_day_start);

  if v_spend.hour_cost_usd >= v_hourly_cost_cap then
    v_breaches := array_append(v_breaches, format('$%s spent in the last hour (limit $%s)', round(v_spend.hour_cost_usd, 2), v_hourly_cost_cap));
  elsif v_spend.hour_cost_usd >= v_hourly_cost_cap * 0.5 then
    v_elevated := array_append(v_elevated, format('$%s spent in the last hour', round(v_spend.hour_cost_usd, 2)));
  end if;
  if v_spend.hour_tokens >= v_hourly_token_cap then
    v_breaches := array_append(v_breaches, format('%s tokens in the last hour (limit %s)', v_spend.hour_tokens, v_hourly_token_cap));
  elsif v_spend.hour_tokens >= v_hourly_token_cap * 0.5 then
    v_elevated := array_append(v_elevated, format('%s tokens in the last hour', v_spend.hour_tokens));
  end if;
  if v_spend.hour_calls >= v_hourly_call_cap then
    v_breaches := array_append(v_breaches, format('%s AI calls in the last hour (limit %s)', v_spend.hour_calls, v_hourly_call_cap));
  elsif v_spend.hour_calls >= v_hourly_call_cap * 0.5 then
    v_elevated := array_append(v_elevated, format('%s AI calls in the last hour', v_spend.hour_calls));
  end if;
  if v_spend.day_cost_usd >= v_daily_cost_cap then
    v_breaches := array_append(v_breaches, format('$%s spent today (daily cap $%s)', round(v_spend.day_cost_usd, 2), v_daily_cost_cap));
  elsif v_spend.day_cost_usd >= v_daily_cost_cap * 0.75 then
    v_elevated := array_append(v_elevated, format('$%s spent today', round(v_spend.day_cost_usd, 2)));
  end if;

  if cardinality(v_breaches) > 0 then
    -- Pause everything only when user-initiated traffic is itself a big share of the
    -- spike (e.g. a chat loop); otherwise pause background work and keep chat alive.
    v_user_heavy := v_spend.user_hour_cost_usd >= v_hourly_cost_cap * 0.5
      or v_spend.user_hour_tokens >= v_hourly_token_cap * 0.5
      or v_spend.user_hour_calls >= v_hourly_call_cap * 0.5;
    v_scope := case when v_user_heavy then 'all' else 'background' end;

    if coalesce((v_cfg->>'auto_trip_enabled')::boolean, true)
       and (not v_paused or (v_scope = 'all' and v_cfg->>'pause_scope' = 'background')) then
      insert into public.settings (key, value, updated_at)
      values ('ai_circuit_breaker', v_cfg || jsonb_build_object(
        'paused', true,
        'pause_scope', v_scope,
        'pause_until', null,
        'tripped_by', 'auto',
        'tripped_at', v_now,
        'trip_reason', array_to_string(v_breaches, '; ')
      ), v_now)
      on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
      v_tripped := true;
      v_paused := true;
    end if;

    v_open_keys := array_append(v_open_keys, 'ai_spend:runaway');
    if public.upsert_system_alert(
      'ai_spend:runaway', 'ai_spend', 'critical',
      case when v_paused then 'AI usage spike: circuit breaker tripped' else 'AI usage over its limits' end,
      array_to_string(v_breaches, '; ')
        || case when v_tripped then format('. Paused %s AI until you resume it.', case when v_scope = 'all' then 'all' else 'background' end) else '' end,
      jsonb_build_object('hour_cost_usd', v_spend.hour_cost_usd, 'hour_tokens', v_spend.hour_tokens,
        'hour_calls', v_spend.hour_calls, 'day_cost_usd', v_spend.day_cost_usd, 'scope', v_scope)
    ) then
      v_new_critical := v_new_critical || jsonb_build_object('key', 'ai_spend:runaway',
        'title', 'AI circuit breaker tripped', 'body', array_to_string(v_breaches, '; '));
    end if;
  elsif cardinality(v_elevated) > 0 then
    v_open_keys := array_append(v_open_keys, 'ai_spend:elevated');
    perform public.upsert_system_alert(
      'ai_spend:elevated', 'ai_spend', 'warning',
      'AI usage running high',
      array_to_string(v_elevated, '; ') || '. The breaker trips automatically if it keeps climbing.',
      jsonb_build_object('hour_cost_usd', v_spend.hour_cost_usd, 'hour_tokens', v_spend.hour_tokens,
        'hour_calls', v_spend.hour_calls, 'day_cost_usd', v_spend.day_cost_usd)
    );
  end if;

  -- 2. Calendar feed latency (mean since the previous snapshot) ----------------------
  select coalesce(sum(s.calls), 0), coalesce(sum(s.total_exec_time), 0)
    into v_feed_calls, v_feed_ms
  from extensions.pg_stat_statements s
  where s.query ilike 'WITH pgrst_source%' and s.query ilike '%get_calendar_feed%';

  select * into v_prev
  from public.query_latency_snapshots
  where query_label = 'get_calendar_feed'
  order by captured_at desc
  limit 1;

  insert into public.query_latency_snapshots (query_label, calls, total_exec_ms, captured_at)
  values ('get_calendar_feed', v_feed_calls, v_feed_ms, v_now);
  delete from public.query_latency_snapshots where captured_at < v_now - interval '7 days';

  -- A negative delta means pg_stat_statements was reset; skip that window.
  if v_prev.id is not null
     and v_prev.captured_at > v_now - interval '45 minutes'
     and v_feed_calls - v_prev.calls >= 5
     and v_feed_ms >= v_prev.total_exec_ms then
    v_feed_mean_ms := round(((v_feed_ms - v_prev.total_exec_ms) / (v_feed_calls - v_prev.calls))::numeric, 1);
    if v_feed_mean_ms >= 1000 then
      v_open_keys := array_append(v_open_keys, 'latency:calendar_feed');
      if public.upsert_system_alert(
        'latency:calendar_feed', 'latency',
        case when v_feed_mean_ms >= 5000 then 'critical' else 'warning' end,
        'Calendar loading slowly',
        format('The calendar feed averaged %s ms per load over the last check window (normal is about 200 ms).', v_feed_mean_ms),
        jsonb_build_object('mean_ms', v_feed_mean_ms, 'calls', v_feed_calls - v_prev.calls)
      ) and v_feed_mean_ms >= 5000 then
        v_new_critical := v_new_critical || jsonb_build_object('key', 'latency:calendar_feed',
          'title', 'Calendar loading very slowly', 'body', format('Calendar feed averaging %s ms per load.', v_feed_mean_ms));
      end if;
    end if;
  end if;

  -- 3. Background edge-function calls (pg_net) --------------------------------------
  -- Timeouts are NOT errors here: pg_net stops waiting at 10s (cron guardrail) but long
  -- jobs like scan-gmail-inbox keep running and finish. Only real HTTP errors alert.
  select count(*),
         count(*) filter (where r.status_code >= 400 or (r.status_code is null and not r.timed_out)),
         count(*) filter (where r.timed_out)
    into v_http_total, v_http_errors, v_http_timeouts
  from net._http_response r
  where r.created >= v_now - interval '1 hour';

  if v_http_total >= 4 and v_http_errors >= 3 and v_http_errors::numeric / v_http_total >= 0.25 then
    v_open_keys := array_append(v_open_keys, 'background_calls:errors');
    perform public.upsert_system_alert(
      'background_calls:errors', 'background_calls',
      case when v_http_errors = v_http_total then 'critical' else 'warning' end,
      'Background jobs failing',
      format('%s of %s background function calls returned errors in the last hour.', v_http_errors, v_http_total),
      jsonb_build_object('total', v_http_total, 'errors', v_http_errors, 'timeouts', v_http_timeouts)
    );
  end if;

  -- 4. Cron jobs whose last two runs both failed ---------------------------------------
  for v_cron in
    select j.jobname, (array_agg(d.return_message order by d.start_time desc))[1] as last_message
    from cron.job j
    join lateral (
      select dd.status, dd.return_message, dd.start_time
      from cron.job_run_details dd
      where dd.jobid = j.jobid and dd.start_time >= v_now - interval '6 hours'
      order by dd.start_time desc
      limit 2
    ) d on true
    where j.active
    group by j.jobname
    having count(*) = 2 and bool_and(d.status = 'failed')
  loop
    v_open_keys := array_append(v_open_keys, ('cron:' || v_cron.jobname));
    perform public.upsert_system_alert(
      'cron:' || v_cron.jobname, 'cron', 'warning',
      format('Scheduled job "%s" is failing', v_cron.jobname),
      format('Its last two runs failed: %s', left(coalesce(v_cron.last_message, 'no message'), 240)),
      jsonb_build_object('job', v_cron.jobname)
    );
  end loop;

  -- 5. Client-side error bursts ------------------------------------------------------
  select count(*) into v_client_errors_hour
  from public.client_error_log
  where occurred_at >= v_now - interval '1 hour';

  if v_client_errors_hour >= 10 then
    v_open_keys := array_append(v_open_keys, 'client_errors:burst');
    perform public.upsert_system_alert(
      'client_errors:burst', 'client_errors', 'warning',
      'App errors spiking',
      format('%s app errors were reported in the last hour. See the error log below for which ones.', v_client_errors_hour),
      jsonb_build_object('count', v_client_errors_hour)
    );
  end if;

  -- Resolve everything that did not re-fire this run.
  update public.system_alerts
     set resolved_at = v_now
   where resolved_at is null
     and not (alert_key = any (v_open_keys));

  -- In-app bell notification for newly opened critical alerts only.
  for v_alert in select * from jsonb_array_elements(v_new_critical) as e(value)
  loop
    insert into public.notifications (type, title, body, source, read, dedupe_key)
    values ('system_alert', v_alert.value->>'title', v_alert.value->>'body', 'system', false,
      'system_alert:' || (v_alert.value->>'key') || ':' || to_char(v_now, 'YYYYMMDDHH24MI'))
    on conflict do nothing;
  end loop;

  v_result := jsonb_build_object(
    'checked_at', v_now,
    'ai_spend', jsonb_build_object(
      'hour_cost_usd', round(v_spend.hour_cost_usd, 4),
      'hour_tokens', v_spend.hour_tokens,
      'hour_calls', v_spend.hour_calls,
      'day_cost_usd', round(v_spend.day_cost_usd, 4),
      'tripped', v_tripped
    ),
    'calendar_feed', jsonb_build_object('mean_ms', v_feed_mean_ms, 'baseline_ms', 200),
    'background_calls', jsonb_build_object('total', v_http_total, 'errors', v_http_errors, 'timeouts', v_http_timeouts),
    'client_errors_last_hour', v_client_errors_hour,
    'open_alert_keys', to_jsonb(v_open_keys)
  );

  insert into public.settings (key, value, updated_at)
  values ('system_health_last_check', v_result, v_now)
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

  return v_result;
end;
$$;

revoke execute on function public.evaluate_system_health() from public, anon, authenticated;
