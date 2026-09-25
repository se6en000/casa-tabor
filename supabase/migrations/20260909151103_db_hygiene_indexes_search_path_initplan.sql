-- ============================================================
-- 1. Duplicate indexes (drop the redundant one, keep the canonical one)
-- ============================================================
DROP INDEX IF EXISTS public.idx_event_members_member; -- duplicate of idx_event_members_family_member_id
DROP INDEX IF EXISTS public.idx_events_active_calendar; -- duplicate of idx_events_range_lookup (the one named in the Aug 25 post-mortem)
DROP INDEX IF EXISTS public.push_subscriptions_endpoint_uidx; -- duplicate of push_subscriptions_endpoint_key, which backs a UNIQUE constraint

-- ============================================================
-- 2. auth_rls_initplan: avoid re-evaluating auth.uid() per row
-- ============================================================
ALTER POLICY "capture devices own rows" ON public.capture_devices
  USING (created_by = (select auth.uid()))
  WITH CHECK (created_by = (select auth.uid()));

-- ============================================================
-- 3. function_search_path_mutable: pin search_path on the 20 flagged
-- application functions (excludes pg_trgm's own built-in functions,
-- which are extension-owned and not part of this advisory).
-- ============================================================
ALTER FUNCTION public.update_updated_at() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.set_prep_item_suppressions_updated_at() SET search_path = public;
ALTER FUNCTION public.bump_grocery_item_version() SET search_path = public;
ALTER FUNCTION public.bump_recipe_updated_at() SET search_path = public;
ALTER FUNCTION public.bump_recipe_meal_plan_updated_at() SET search_path = public;
ALTER FUNCTION public.recurrence_path_is_inherited(jsonb, text) SET search_path = public;
ALTER FUNCTION public.touch_ai_memory_observations_updated_at() SET search_path = public;
ALTER FUNCTION public.touch_ai_bug_reports_updated_at() SET search_path = public;
ALTER FUNCTION public.normalize_phone(text) SET search_path = public;
ALTER FUNCTION public.find_duplicate_place_pairs() SET search_path = public;
ALTER FUNCTION public.find_duplicate_contact_pairs() SET search_path = public;
ALTER FUNCTION public.find_duplicate_family_link_groups() SET search_path = public;
ALTER FUNCTION public.find_duplicate_connection_groups() SET search_path = public;
ALTER FUNCTION public.merge_saved_places(uuid, uuid[]) SET search_path = public;
ALTER FUNCTION public.merge_saved_contacts(uuid, uuid[]) SET search_path = public;
ALTER FUNCTION public.dismiss_directory_duplicate(text, uuid, uuid) SET search_path = public;
ALTER FUNCTION public.find_similar_places(text, text, uuid, boolean) SET search_path = public;
ALTER FUNCTION public.find_similar_contacts(text, text, text, uuid, boolean) SET search_path = public;
ALTER FUNCTION public.update_household_capture_rules_updated_at() SET search_path = public;

-- ============================================================
-- 4. unindexed_foreign_keys: add covering indexes for FK columns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ai_conversation_messages_conversation_id ON public.ai_conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversation_summaries_conversation_id ON public.ai_conversation_summaries(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_owner_member_id ON public.ai_conversations(owner_member_id);
CREATE INDEX IF NOT EXISTS idx_ai_event_edit_history_event_id ON public.ai_event_edit_history(event_id);
CREATE INDEX IF NOT EXISTS idx_ai_event_edit_history_reverted_history_id ON public.ai_event_edit_history(reverted_history_id);
CREATE INDEX IF NOT EXISTS idx_ai_event_edit_history_undone_by_history_id ON public.ai_event_edit_history(undone_by_history_id);
CREATE INDEX IF NOT EXISTS idx_ai_memories_owner_member_id ON public.ai_memories(owner_member_id);
CREATE INDEX IF NOT EXISTS idx_ai_memories_source_conversation_id ON public.ai_memories(source_conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_project_items_calendar_event_id ON public.ai_project_items(calendar_event_id);
CREATE INDEX IF NOT EXISTS idx_ai_project_items_project_id ON public.ai_project_items(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_project_items_source_conversation_id ON public.ai_project_items(source_conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_project_revisions_project_id ON public.ai_project_revisions(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_project_revisions_source_conversation_id ON public.ai_project_revisions(source_conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_projects_owner_member_id ON public.ai_projects(owner_member_id);
CREATE INDEX IF NOT EXISTS idx_ai_projects_source_conversation_id ON public.ai_projects(source_conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_provider_calls_retry_of ON public.ai_provider_calls(retry_of);
CREATE INDEX IF NOT EXISTS idx_billing_line_items_import_id ON public.billing_line_items(import_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_operations_connection_id ON public.calendar_sync_operations(connection_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_operations_depends_on_operation_id ON public.calendar_sync_operations(depends_on_operation_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_operations_event_id ON public.calendar_sync_operations(event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_operations_series_id ON public.calendar_sync_operations(series_id);
CREATE INDEX IF NOT EXISTS idx_capture_requests_capture_device_id ON public.capture_requests(capture_device_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_event_a_id ON public.conflicts(event_a_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_resolved_by ON public.conflicts(resolved_by);
CREATE INDEX IF NOT EXISTS idx_email_conflicts_family_member_id ON public.email_conflicts(family_member_id);
CREATE INDEX IF NOT EXISTS idx_email_conflicts_trip_id ON public.email_conflicts(trip_id);
CREATE INDEX IF NOT EXISTS idx_event_action_items_assigned_to ON public.event_action_items(assigned_to);
CREATE INDEX IF NOT EXISTS idx_event_checklist_items_event_id ON public.event_checklist_items(event_id);
CREATE INDEX IF NOT EXISTS idx_event_logistics_event_id ON public.event_logistics(event_id);
CREATE INDEX IF NOT EXISTS idx_event_series_source_connection_id ON public.event_series(source_connection_id);
CREATE INDEX IF NOT EXISTS idx_events_series_id ON public.events(series_id);
CREATE INDEX IF NOT EXISTS idx_family_data_chunks_document_id ON public.family_data_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_family_knowledge_claims_event_id ON public.family_knowledge_claims(event_id);
CREATE INDEX IF NOT EXISTS idx_family_knowledge_claims_prep_item_id ON public.family_knowledge_claims(prep_item_id);
CREATE INDEX IF NOT EXISTS idx_family_knowledge_claims_superseded_by ON public.family_knowledge_claims(superseded_by);
CREATE INDEX IF NOT EXISTS idx_gmail_processed_messages_family_member_id ON public.gmail_processed_messages(family_member_id);
CREATE INDEX IF NOT EXISTS idx_gmail_processed_messages_updated_event_id ON public.gmail_processed_messages(updated_event_id);
CREATE INDEX IF NOT EXISTS idx_google_recurrence_import_runs_connection_id ON public.google_recurrence_import_runs(connection_id);
CREATE INDEX IF NOT EXISTS idx_google_recurrence_resources_adopted_series_id ON public.google_recurrence_resources(adopted_series_id);
CREATE INDEX IF NOT EXISTS idx_google_recurrence_resources_connection_id ON public.google_recurrence_resources(connection_id);
CREATE INDEX IF NOT EXISTS idx_google_recurrence_resources_last_seen_run_id ON public.google_recurrence_resources(last_seen_run_id);
CREATE INDEX IF NOT EXISTS idx_grocery_aisle_mappings_store_profile_id ON public.grocery_aisle_mappings(store_profile_id);
CREATE INDEX IF NOT EXISTS idx_grocery_category_corrections_grocery_item_id ON public.grocery_category_corrections(grocery_item_id);
CREATE INDEX IF NOT EXISTS idx_prep_item_feedback_prep_item_id ON public.prep_item_feedback(prep_item_id);
CREATE INDEX IF NOT EXISTS idx_prep_item_resolutions_prep_item_id ON public.prep_item_resolutions(prep_item_id);
CREATE INDEX IF NOT EXISTS idx_recipe_images_recipe_id ON public.recipe_images(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON public.recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_meal_plans_recipe_id ON public.recipe_meal_plans(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_steps_recipe_id ON public.recipe_steps(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recurrence_mutation_history_reverted_history_id ON public.recurrence_mutation_history(reverted_history_id);
CREATE INDEX IF NOT EXISTS idx_recurrence_mutation_history_selected_event_id ON public.recurrence_mutation_history(selected_event_id);
CREATE INDEX IF NOT EXISTS idx_recurrence_mutation_history_series_id ON public.recurrence_mutation_history(series_id);
CREATE INDEX IF NOT EXISTS idx_recurrence_mutation_history_undone_by_history_id ON public.recurrence_mutation_history(undone_by_history_id);
CREATE INDEX IF NOT EXISTS idx_sync_state_family_member_id ON public.sync_state(family_member_id);
CREATE INDEX IF NOT EXISTS idx_travel_email_scan_log_family_member_id ON public.travel_email_scan_log(family_member_id);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_family_member_id ON public.voice_sessions(family_member_id);
