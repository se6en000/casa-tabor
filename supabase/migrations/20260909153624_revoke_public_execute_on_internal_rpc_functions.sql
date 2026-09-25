-- Follow-up to revoke_anon_execute_on_internal_rpc_functions: these 20
-- functions had an explicit GRANT EXECUTE ... TO PUBLIC (visible as the
-- "=X/postgres" entry in pg_proc.proacl), which a REVOKE FROM anon,
-- authenticated does not touch -- PUBLIC is a separate grant target that
-- every role, including anon and authenticated, still inherits from.
-- service_role keeps its own explicit grant, unaffected by this.
REVOKE EXECUTE ON FUNCTION public.ai_apply_event_update(p_event_id uuid, p_event_updates jsonb, p_enrichment_updates jsonb, p_checklist_items jsonb, p_action_items jsonb, p_members_add uuid[], p_members_remove uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_apply_event_update(p_event_id uuid, p_event_updates jsonb, p_enrichment_updates jsonb, p_checklist_items jsonb, p_action_items jsonb, p_members_add uuid[], p_members_remove uuid[], p_action_id text, p_expected_updated_at timestamp with time zone, p_request_payload jsonb, p_ai_session_id text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_build_event_snapshot(p_event_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_restore_event_snapshot(p_event_id uuid, p_snapshot jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_revert_event_edit(p_action_id text, p_undo_action_id text, p_ai_session_id text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_family_event_child_projection() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_family_event_projection() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_family_generic_projection() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_google_sync_job(p_event_id uuid, p_audit_history_id uuid, p_error text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mutate_recurring_event(p_action_id text, p_selected_event_id uuid, p_scope text, p_mutation_type text, p_expected_series_revision bigint, p_changed_paths text[], p_detail_patch jsonb, p_series_patch jsonb, p_actor jsonb, p_correlation_id text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_event_added() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_event_enriched() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_event_updated() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prune_operational_logs(p_debug_retention interval, p_cron_retention interval) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_event_coords_on_location_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_event_checklist_legacy_projection() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_analyze_conflicts_for_event() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_analyze_conflicts_for_event_member() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_enrich_event() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_geocode_event_location() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_event_bundle(p_payload jsonb) FROM PUBLIC;
