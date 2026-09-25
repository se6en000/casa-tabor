-- ============================================================
-- Group A: server-internal tables — no direct client access observed
-- (0 src/ references; written/read only by edge functions using the
-- service_role key, which bypasses RLS regardless). Lock to service_role
-- so a leaked anon key can no longer read these directly over the internet.
-- ============================================================
ALTER TABLE public.voice_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voice_sessions service role only" ON public.voice_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms_log service role only" ON public.sms_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.ai_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_sessions service role only" ON public.ai_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.ai_event_edit_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_event_edit_history service role only" ON public.ai_event_edit_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.recipe_import_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recipe_import_runs service role only" ON public.recipe_import_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.daily_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_briefings service role only" ON public.daily_briefings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync_state service role only" ON public.sync_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venues service role only" ON public.venues
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.travel_email_scan_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "travel_email_scan_log service role only" ON public.travel_email_scan_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.travel_auto_scan_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "travel_auto_scan_state service role only" ON public.travel_auto_scan_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.grocery_store_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grocery_store_profiles service role only" ON public.grocery_store_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Group B: read by client (settings/forensics page), written only by
-- the ingest-ai-drawer-debug edge function.
-- ============================================================
ALTER TABLE public.ai_drawer_debug_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_drawer_debug_events service role write" ON public.ai_drawer_debug_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "ai_drawer_debug_events family read" ON public.ai_drawer_debug_events
  FOR SELECT USING (true);

-- ============================================================
-- Group C: app data tables actively read/written by the client via the
-- anon key. This app has no per-user Supabase Auth (single-household
-- kiosk, PIN gate is app-layer only), so every other table in this schema
-- already uses a permissive `true` policy for family access — matching
-- that existing convention here keeps behavior unchanged while making the
-- access explicit instead of accidental (RLS was simply off before).
-- ============================================================
ALTER TABLE public.event_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family full access" ON public.event_members FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.event_enrichments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family full access" ON public.event_enrichments FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.event_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family full access" ON public.event_checklist_items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.event_action_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family full access" ON public.event_action_items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.grocery_aisle_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family full access" ON public.grocery_aisle_mappings FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.grocery_catalog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family full access" ON public.grocery_catalog_items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.grocery_category_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family full access" ON public.grocery_category_corrections FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family full access" ON public.recipes FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family full access" ON public.recipe_ingredients FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.recipe_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family full access" ON public.recipe_steps FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.recipe_meal_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family full access" ON public.recipe_meal_plans FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.grocery_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family full access" ON public.grocery_items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.grocery_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family full access" ON public.grocery_lists FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family full access" ON public.events FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.google_sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family full access" ON public.google_sync_jobs FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.event_logistics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family full access" ON public.event_logistics FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family full access" ON public.family_members FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family full access" ON public.settings FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.recipe_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family full access" ON public.recipe_images FOR ALL USING (true) WITH CHECK (true);
