-- Migration: Add agency_level and policy_disclaimer to prep_items table
-- Ensures explicit agency-based partitioning and claim/return policy footnotes

ALTER TABLE public.prep_items
  ADD COLUMN IF NOT EXISTS agency_level INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS policy_disclaimer TEXT;

-- Create index for efficient querying of actionable vs logistics items
CREATE INDEX IF NOT EXISTS idx_prep_items_agency_level
  ON public.prep_items(agency_level)
  WHERE dismissed = false;

-- Create index for attention thread lookups
CREATE INDEX IF NOT EXISTS idx_prep_items_attention_thread_key
  ON public.prep_items(attention_thread_key)
  WHERE dismissed = false;
