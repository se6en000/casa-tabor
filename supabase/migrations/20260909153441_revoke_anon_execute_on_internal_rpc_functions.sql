-- Revoke anon/authenticated EXECUTE on internal RPC functions that are not
-- called directly by the client (src/ only calls 7 of the 76 flagged
-- SECURITY DEFINER functions via supabase.rpc() -- those 7 are left alone).
-- Everything below is either a Postgres trigger function (already
-- uncallable directly, revoked here purely for hygiene) or a function only
-- ever invoked by edge functions using the service_role key, which is
-- unaffected by REVOKE. Closes direct rpc() access to calendar mutation
-- (mutate_recurring_event, upsert_event_bundle, ai_apply_event_update,
-- recurrence_*_core) and destructive maintenance ops
-- (recurrence_rollback_shadow_migration, purge_expired_family_email_evidence,
-- prune_*) that were previously callable by anyone holding the public anon key.

REVOKE EXECUTE ON FUNCTION public.ai_apply_event_update(p_event_id uuid, p_event_updates jsonb, p_enrichment_updates jsonb, p_checklist_items jsonb, p_action_items jsonb, p_members_add uuid[], p_members_remove uuid[]) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_apply_event_update(p_event_id uuid, p_event_updates jsonb, p_enrichment_updates jsonb, p_checklist_items jsonb, p_action_items jsonb, p_members_add uuid[], p_members_remove uuid[], p_action_id text, p_expected_updated_at timestamp with time zone, p_request_payload jsonb, p_ai_session_id text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_build_event_snapshot(p_event_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_restore_event_snapshot(p_event_id uuid, p_snapshot jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_revert_event_edit(p_action_id text, p_undo_action_id text, p_ai_session_id text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_expire_stale_prep_items() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_family_data_index_jobs(worker_id text, batch_size integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_google_sync_jobs(p_worker_id text, p_limit integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_pending_event_transportation_plans() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_event_title_without_person_prefix() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_prep_item_action_identity() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_event_transportation_plan_generation(target_event_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_family_event_child_projection() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_family_event_projection() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_family_generic_projection() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_google_sync_job(p_event_id uuid, p_audit_history_id uuid, p_error text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_past_conflicts(p_before timestamp with time zone) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finish_google_sync_job(p_job_id uuid, p_worker_id text, p_success boolean, p_error text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_active_conflict_alerts() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.google_sync_watchdog_dispatch(p_stale_after interval, p_recurrence_limit integer, p_legacy_limit integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.maintain_system_operational_queues() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mutate_recurring_event(p_action_id text, p_selected_event_id uuid, p_scope text, p_mutation_type text, p_expected_series_revision bigint, p_changed_paths text[], p_detail_patch jsonb, p_series_patch jsonb, p_actor jsonb, p_correlation_id text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_event_title_person_prefix(p_title text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_event_added() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_event_enriched() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_event_updated() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prune_expired_ai_conversations() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prune_old_notifications() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prune_operational_logs(p_debug_retention interval, p_cron_retention interval) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_expired_family_email_evidence(retention_interval interval) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_family_data_projection(p_source_type text, p_source_id text, p_operation text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_google_projection_detail_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_adopt_google_master_core(p_resource_id uuid, p_explicit boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_adopt_google_masters_core(p_resource_ids uuid[], p_explicit boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_apply_event_patch(p_event_id uuid, p_patch jsonb, p_changed_paths text[], p_respect_exceptions boolean, p_series_revision bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_apply_reusable_graph(p_event_id uuid, p_detail_patch jsonb, p_changed_paths text[], p_respect_exceptions boolean, p_series_revision bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_apply_scoped_mutation_core(p_action_id text, p_selected_event_id uuid, p_scope text, p_mutation_type text, p_expected_series_revision bigint, p_changed_paths text[], p_detail_patch jsonb, p_series_patch jsonb, p_actor jsonb, p_correlation_id text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_apply_scoped_mutation_without_exception_policy_core(p_action_id text, p_selected_event_id uuid, p_scope text, p_mutation_type text, p_expected_series_revision bigint, p_changed_paths text[], p_detail_patch jsonb, p_series_patch jsonb, p_actor jsonb, p_correlation_id text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_apply_segment_mutation_core(p_action_id text, p_selected_event_id uuid, p_scope text, p_mutation_type text, p_expected_series_revision bigint, p_changed_paths text[], p_detail_patch jsonb, p_series_patch jsonb, p_actor jsonb, p_correlation_id text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_apply_shadow_migration(p_action_id text, p_plan jsonb, p_actor jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_build_event_snapshot(p_event_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_build_reusable_patch(p_event_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_claim_google_sync_operations(p_worker_id text, p_limit integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_clone_reusable_graph(p_source_event_id uuid, p_target_event_id uuid, p_series_revision bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_delete_scoped_core(p_action_id text, p_selected_event_id uuid, p_scope text, p_expected_series_revision bigint, p_series_patch jsonb, p_actor jsonb, p_correlation_id text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_finalize_google_import_core(p_run_id uuid, p_next_sync_token text, p_full_reconciliation boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_finish_google_sync_operation(p_operation_id uuid, p_worker_id text, p_success boolean, p_retryable boolean, p_google_response jsonb, p_error text, p_conflict_detected boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_get_editor_context_core(p_selected_event_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_link_google_instance(p_series_id uuid, p_occurrence_id uuid, p_connection_id uuid, p_calendar_id text, p_google_event_id text, p_google_ical_uid text, p_google_etag text, p_google_updated_at timestamp with time zone) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_link_google_occurrences_core(p_connection_id uuid, p_instances jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_purge_deleted_core() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_reconcile_materialized_occurrences(p_series_id uuid, p_expected_series_revision bigint, p_occurrences jsonb, p_range_start timestamp with time zone, p_range_end timestamp with time zone, p_correlation_id text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_retry_google_sync_operation(p_operation_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_rollback_shadow_migration(p_action_id text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_set_rollout_flags(p_expected_flags jsonb, p_next_flags jsonb, p_reason text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_stage_google_resources_core(p_run_id uuid, p_resources jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recurrence_undo_delete_core(p_action_id text, p_delete_history_id uuid, p_expected_series_revision bigint, p_actor jsonb, p_correlation_id text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_event_coords_on_location_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.search_family_data(query_text text, query_embedding vector, query_entities text[], query_start timestamp with time zone, query_end timestamp with time zone, requested_source_types text[], include_history boolean, match_count integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_event_checklist_if_empty(p_event_id uuid, p_labels jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_event_checklist_legacy_projection() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_analyze_conflicts_for_event() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_analyze_conflicts_for_event_member() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_enrich_event() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_event_transportation_enrichment_generation() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_event_transportation_member_generation() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_event_transportation_plan_generation() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_geocode_event_location() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_event_bundle(p_payload jsonb) FROM anon, authenticated;
