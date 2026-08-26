-- Migration: Permanent Zero-Thrashing Database Stability Guardrails
-- Date: 2026-08-26
-- Description: Enforces global database and role timeouts, optimizes operational queue pruning, and prevents connection exhaustion.

-- 1. Enforce strict statement and idle-in-transaction session timeouts across all roles
ALTER ROLE authenticator SET statement_timeout = '15s';
ALTER ROLE authenticated SET statement_timeout = '15s';
ALTER ROLE anon SET statement_timeout = '15s';
ALTER ROLE service_role SET statement_timeout = '30s';

ALTER ROLE authenticator SET idle_in_transaction_session_timeout = '10s';
ALTER ROLE authenticated SET idle_in_transaction_session_timeout = '10s';
ALTER ROLE anon SET idle_in_transaction_session_timeout = '10s';
ALTER ROLE service_role SET idle_in_transaction_session_timeout = '15s';

-- 2. Robust operational queue maintenance function with error containment
CREATE OR REPLACE FUNCTION public.maintain_system_operational_queues()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, cron
AS $$
BEGIN
  -- Prune pg_net responses and queues older than 2 hours
  DELETE FROM net._http_response WHERE created < now() - interval '2 hours';
  DELETE FROM net.http_request_queue WHERE created < now() - interval '2 hours';
  
  -- Prune cron run details older than 24 hours
  DELETE FROM cron.job_run_details WHERE start_time < now() - interval '24 hours';
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'maintain_system_operational_queues encountered non-fatal error: %', SQLERRM;
END;
$$;

-- Grant execution permissions
REVOKE ALL ON FUNCTION public.maintain_system_operational_queues() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.maintain_system_operational_queues() TO postgres, service_role;

-- 3. Clean up any stale backlog immediately
SELECT public.maintain_system_operational_queues();
