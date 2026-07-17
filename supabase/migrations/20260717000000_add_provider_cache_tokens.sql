ALTER TABLE ai_usage_log
  ADD COLUMN IF NOT EXISTS cached_input_tokens INTEGER NOT NULL DEFAULT 0
  CHECK (cached_input_tokens >= 0);
