-- ============================================================================
-- Drop the dead analyze-conflicts / geocode row triggers
--
-- Verified 2026-09-21 against production:
--   * The vault has no SUPABASE_SERVICE_ROLE_KEY, so these three trigger
--     functions have been silent no-ops: each just logged a warning and
--     returned (with the original triggers, 1 event + 3 attendees queued a
--     single net.http_post -- enrich-event -- and zero analyze/geocode calls).
--   * Conflict analysis runs through orchestrate-household (invoked by the
--     HomePage cadence and generate-briefing); analyze-conflicts itself makes
--     no model calls, and remains deployed for that path.
--   * Nothing depends on trigger-filled coordinates: route ETA, weather and
--     transportation planning resolve locations from the address text, and
--     maps_provider_calls shows zero geocode-event-location calls in 60 days.
--   * Turning them on is explicitly NOT wanted (cost). Removing them also
--     removes a vault lookup + warning log per event / per attendee row.
--
-- Untouched on purpose: the BEFORE trigger reset_coords_on_event_location_change
-- (cheap: reuses coordinates already stored on another event with the same
-- address before anything would call Google).
-- ============================================================================

drop trigger if exists auto_analyze_conflicts_on_event_change on public.events;
drop trigger if exists auto_analyze_conflicts_on_event_member_change on public.event_members;
drop trigger if exists auto_geocode_on_event_location_change on public.events;

drop function if exists public.trigger_analyze_conflicts_for_event();
drop function if exists public.trigger_analyze_conflicts_for_event_member();
drop function if exists public.trigger_geocode_event_location();
