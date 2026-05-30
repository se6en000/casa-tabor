-- Add event_type to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'event'
  CHECK (event_type IN ('event', 'reminder'));

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS events_type_idx ON events(event_type);
