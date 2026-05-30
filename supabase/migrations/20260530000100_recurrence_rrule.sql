-- Add RRULE string column for recurring event rules (RFC 5545 RRULE syntax)
ALTER TABLE events ADD COLUMN IF NOT EXISTS rrule text;
