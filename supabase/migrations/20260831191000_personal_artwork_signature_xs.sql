-- Migration: Update signature defaults to Extra Small (xs), White Gel Pen (light), 75% opacity, and Homemade Apple script (draft)
-- Target: public.personal_artwork
-- Idempotent and migration-safe

ALTER TABLE public.personal_artwork
  ALTER COLUMN signature_size SET DEFAULT 'xs',
  ALTER COLUMN signature_color SET DEFAULT 'light',
  ALTER COLUMN signature_opacity SET DEFAULT 0.75,
  ALTER COLUMN signature_style SET DEFAULT 'draft';

UPDATE public.personal_artwork
SET signature_size = 'xs',
    signature_color = 'light',
    signature_opacity = 0.75,
    signature_style = 'draft',
    updated_at = now()
WHERE signature_enabled = true;
