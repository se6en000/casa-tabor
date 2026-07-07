-- admin_ops_audit_log table for tracking all bulk calendar operations
CREATE TABLE IF NOT EXISTS admin_ops_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text NOT NULL UNIQUE,
  operation text NOT NULL CHECK (operation IN ('delete', 'add', 'edit')),
  description text NOT NULL,
  scope_filters jsonb NOT NULL,
  rows_affected integer NOT NULL DEFAULT 0,
  errors jsonb,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending',
  executed_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for querying recent operations
CREATE INDEX IF NOT EXISTS idx_admin_ops_audit_log_executed_at 
  ON admin_ops_audit_log (executed_at DESC);

-- Index for job lookup
CREATE INDEX IF NOT EXISTS idx_admin_ops_audit_log_job_id 
  ON admin_ops_audit_log (job_id);

-- RLS Policy: Only authenticated users can read (admin-only enforcement happens at app level)
ALTER TABLE admin_ops_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_admin_ops_audit" ON admin_ops_audit_log
  FOR SELECT TO authenticated
  USING (true);

-- No insert/update/delete via RLS (only via edge function with service role)
CREATE POLICY "no_public_insert_admin_ops_audit" ON admin_ops_audit_log
  FOR INSERT TO public
  WITH CHECK (false);

CREATE POLICY "no_public_update_admin_ops_audit" ON admin_ops_audit_log
  FOR UPDATE TO public
  USING (false);

CREATE POLICY "no_public_delete_admin_ops_audit" ON admin_ops_audit_log
  FOR DELETE TO public
  USING (false);
