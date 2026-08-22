-- Migration: Support Gmail attachments and Gemini Multimodal document extraction
-- Adds attachments JSONB, extracted_document_summary to gmail_processed_messages, and source_origin to prep_items

ALTER TABLE public.gmail_processed_messages
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS extracted_document_summary TEXT;

ALTER TABLE public.prep_items
  ADD COLUMN IF NOT EXISTS source_origin TEXT DEFAULT 'email_body';

-- Index canonical_email_id for fast lookup
CREATE INDEX IF NOT EXISTS idx_gmail_processed_messages_canonical_email
  ON public.gmail_processed_messages(canonical_email_id);
