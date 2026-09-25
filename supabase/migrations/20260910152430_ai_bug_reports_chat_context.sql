-- Adds chat-transcript context to the existing ai_bug_reports table so the
-- copilot drawer's "flag this chat" button can file into the same bug backlog
-- the assistant already writes to via its own bug_report tool (source='assistant').
-- All additive/nullable: existing inserts (title/details/severity/status/source
-- only) are unaffected.
ALTER TABLE public.ai_bug_reports
  ADD COLUMN IF NOT EXISTS transcript JSONB,
  ADD COLUMN IF NOT EXISTS page TEXT,
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS device_id TEXT,
  ADD COLUMN IF NOT EXISTS member_name TEXT;
