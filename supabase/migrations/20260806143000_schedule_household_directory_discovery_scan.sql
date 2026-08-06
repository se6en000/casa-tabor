-- discover_directory_candidates() (and build-household-graph, which must run
-- first since discover_directory_candidates reads household_graph_nodes/edges)
-- were never invoked from anywhere in the running app — no cron, no client
-- call. This left the entire auto-discovery pipeline dormant: new people/
-- places/connections mentioned in AI-chat events or enriched via email/SMS
-- never surfaced as directory suggestions unless a user happened to manually
-- trigger a scan. Schedule it daily so suggestions actually appear.
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'household-directory-discovery-scan'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'household-directory-discovery-scan',
  '30 4 * * *',
  $$
  select net.http_post(
    url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/build-household-graph',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'SUPABASE_SERVICE_ROLE_KEY'
        limit 1
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
