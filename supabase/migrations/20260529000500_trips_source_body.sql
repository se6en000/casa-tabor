-- Add source email storage and type to trips
ALTER TABLE trips ADD COLUMN IF NOT EXISTS source_email_body TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS source_email_subject TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'gmail'; -- 'gmail' | 'pdf'
