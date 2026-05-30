-- AI usage log: one row per edge function invocation
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name TEXT       NOT NULL,
  provider     TEXT        NOT NULL,
  model        TEXT        NOT NULL,
  input_tokens  INTEGER    DEFAULT 0,
  output_tokens INTEGER    DEFAULT 0,
  cached       BOOLEAN     DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Index for dashboard queries (by day)
CREATE INDEX IF NOT EXISTS ai_usage_log_created_at_idx ON ai_usage_log (created_at DESC);

-- RLS: service role can insert, anon can read
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read" ON ai_usage_log FOR SELECT TO anon USING (true);
CREATE POLICY "service insert" ON ai_usage_log FOR INSERT TO service_role WITH CHECK (true);
