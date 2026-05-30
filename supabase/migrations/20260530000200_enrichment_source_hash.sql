-- Add source_hash to event_enrichments so we can skip re-enrichment when event content hasn't changed
ALTER TABLE event_enrichments ADD COLUMN IF NOT EXISTS source_hash TEXT;
