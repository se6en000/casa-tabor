-- Migration: Realtime Publication Alignment & Replica Identity Full
-- Date: 2026-08-25
-- Description: Adds all subscribed tables to supabase_realtime publication and sets REPLICA IDENTITY FULL to eliminate Realtime WAL decoder errors.

-- 1. Ensure all realtime published tables have REPLICA IDENTITY FULL
ALTER TABLE public.events REPLICA IDENTITY FULL;
ALTER TABLE public.event_members REPLICA IDENTITY FULL;
ALTER TABLE public.event_enrichments REPLICA IDENTITY FULL;
ALTER TABLE public.event_plan_overrides REPLICA IDENTITY FULL;
ALTER TABLE public.event_logistics REPLICA IDENTITY FULL;
ALTER TABLE public.event_checklist_items REPLICA IDENTITY FULL;
ALTER TABLE public.event_series REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.calendar_connections REPLICA IDENTITY FULL;
ALTER TABLE public.calendar_sync_operations REPLICA IDENTITY FULL;
ALTER TABLE public.recurrence_mutation_history REPLICA IDENTITY FULL;
ALTER TABLE public.household_capture_rules REPLICA IDENTITY FULL;
ALTER TABLE public.prep_items REPLICA IDENTITY FULL;
ALTER TABLE public.conflicts REPLICA IDENTITY FULL;
ALTER TABLE public.member_availability_rules REPLICA IDENTITY FULL;
ALTER TABLE public.member_availability_exceptions REPLICA IDENTITY FULL;
ALTER TABLE public.family_members REPLICA IDENTITY FULL;
ALTER TABLE public.grocery_items REPLICA IDENTITY FULL;
ALTER TABLE public.ai_provider_calls REPLICA IDENTITY FULL;

-- 2. Add missing client-subscribed tables to supabase_realtime publication
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.event_logistics; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.event_checklist_items; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.prep_items; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conflicts; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.member_availability_rules; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.member_availability_exceptions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.family_members; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.grocery_items; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_provider_calls; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
