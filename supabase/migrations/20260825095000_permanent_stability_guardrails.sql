-- Migration: Permanent Stability & Connection Pool Guardrails
-- Date: 2026-08-25
-- Description: Enforces strict idle-in-transaction timeouts, statement timeouts, and daily cleanup of pg_net / pg_cron metadata.

-- 1. Enforce strict session and statement timeouts to prevent connection pool exhaustion
ALTER ROLE authenticator SET idle_in_transaction_session_timeout = '10s';
ALTER ROLE anon SET idle_in_transaction_session_timeout = '10s';
ALTER ROLE authenticated SET idle_in_transaction_session_timeout = '10s';

ALTER ROLE authenticator SET statement_timeout = '15s';
ALTER ROLE anon SET statement_timeout = '15s';
ALTER ROLE authenticated SET statement_timeout = '15s';

-- 2. Create automated nightly maintenance procedure for pg_net and pg_cron metadata
CREATE OR REPLACE FUNCTION public.maintain_system_operational_queues()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, cron
AS $$
BEGIN
  -- Prune pg_net responses and queues older than 6 hours
  DELETE FROM net._http_response WHERE created < now() - interval '6 hours';
  DELETE FROM net.http_request_queue WHERE created < now() - interval '6 hours';
  
  -- Prune cron run details older than 3 days
  DELETE FROM cron.job_run_details WHERE start_time < now() - interval '3 days';
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'maintain_system_operational_queues encountered non-fatal error: %', SQLERRM;
END;
$$;

-- Grant execution to postgres and service_role
REVOKE ALL ON FUNCTION public.maintain_system_operational_queues() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.maintain_system_operational_queues() TO postgres, service_role;

-- 3. Schedule daily maintenance at 03:45 AM UTC
SELECT cron.schedule(
  'system-operational-queue-maintenance',
  '45 3 * * *',
  'SELECT public.maintain_system_operational_queues();'
)
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'system-operational-queue-maintenance'
);
