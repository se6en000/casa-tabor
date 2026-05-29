-- Inbox monitor v2: intent tracking, travel auto-trigger, conflict surfacing

-- Add intent + raw body storage to processed messages
ALTER TABLE public.gmail_processed_messages
  ADD COLUMN IF NOT EXISTS intent TEXT DEFAULT 'skip',      -- new_event | update_event | travel_detail | skip
  ADD COLUMN IF NOT EXISTS updated_event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_body TEXT,                  -- stored for re-processing
  ADD COLUMN IF NOT EXISTS email_subject TEXT;               -- redundant but faster to query

-- Add latest-wins timestamp to trips
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS source_email_received_at TIMESTAMPTZ;

-- Conflicts table: when email contradicts calendar, surface it instead of silently overwriting
CREATE TABLE IF NOT EXISTS public.email_conflicts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id UUID REFERENCES public.family_members(id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL,
  event_id         UUID REFERENCES public.events(id) ON DELETE CASCADE,
  trip_id          UUID REFERENCES public.trips(id) ON DELETE CASCADE,
  conflict_type    TEXT NOT NULL,   -- 'time_change' | 'location_change' | 'cancellation' | 'trip_update'
  field_name       TEXT,            -- which field changed
  old_value        TEXT,
  new_value        TEXT,
  email_subject    TEXT,
  email_from       TEXT,
  resolved         BOOLEAN DEFAULT FALSE,
  resolved_action  TEXT,            -- 'accepted' | 'rejected'
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.email_conflicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conflicts_all" ON public.email_conflicts FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_conflicts_event ON public.email_conflicts(event_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_resolved ON public.email_conflicts(resolved);
