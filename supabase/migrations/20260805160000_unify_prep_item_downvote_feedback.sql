-- Unifies the three independent "downvote a prep item" code paths (ActionHubPage's
-- useDownvotePrepItem stub, HomeRightPanel's Needs You panel using the same stub, and
-- notification-action's push-notification thumbs_down branch) which had drifted:
-- pressing downvote inside the app just silently dismissed the item with zero
-- feedback recorded, while tapping "not relevant" on a push notification recorded
-- real prep_item_feedback + fed the prep_item_suppressions pattern-learning loop.
-- That meant downvoting meant two different things depending on which surface you
-- used it from -- a correctness bug, not just a UX inconsistency.
--
-- record_prep_item_downvote() is now the single source of truth for "downvote":
-- it reuses the existing, durable resolve_prep_item(..., 'not_relevant') for the
-- idempotent dismiss/resolution-log bookkeeping, then layers on the real feedback
-- signal (prep_item_feedback insert, prep_item_suppressions strength/hard-suppress
-- upsert, downvoted_count/relevance_score bump, and pattern-level mass-dismiss once
-- a pattern is downvoted twice) that previously only existed in the push-action path.

create or replace function public.record_prep_item_downvote(
  p_prep_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.prep_items%rowtype;
  v_pattern_key text;
  next_strength int;
  hard_suppressed boolean;
  existing_suppression public.prep_item_suppressions%rowtype;
  now_ts timestamptz := now();
  resolution jsonb;
begin
  select * into item from public.prep_items where id = p_prep_item_id for update;
  if not found then
    raise exception 'Prep item not found';
  end if;

  v_pattern_key := coalesce(item.source_pattern_key, 'action:general');

  insert into public.prep_item_feedback (
    prep_item_id, source_type, source_pattern_key, source_ref, feedback, created_at
  )
  values (
    p_prep_item_id, coalesce(item.source_type, 'unknown'), v_pattern_key, item.source_ref, 'not_relevant', now_ts
  );

  select * into existing_suppression
  from public.prep_item_suppressions
  where pattern_key = v_pattern_key;

  next_strength := coalesce(existing_suppression.strength, 0) + 1;
  hard_suppressed := coalesce(existing_suppression.hard_suppressed, false) or next_strength >= 3;

  if existing_suppression.id is not null then
    update public.prep_item_suppressions
    set strength = next_strength,
        hard_suppressed = hard_suppressed,
        last_feedback_at = now_ts,
        updated_at = now_ts
    where id = existing_suppression.id;
  else
    insert into public.prep_item_suppressions (
      pattern_key, strength, hard_suppressed, last_feedback_at, updated_at
    )
    values (v_pattern_key, 1, false, now_ts, now_ts);
  end if;

  update public.prep_items
  set downvoted_count = downvoted_count + 1,
      last_feedback_at = now_ts,
      relevance_score = -1
  where id = p_prep_item_id;

  -- Durable, idempotent dismiss + resolution-log bookkeeping (shared with Mark done).
  resolution := public.resolve_prep_item(p_prep_item_id, 'not_relevant');

  -- Once a pattern has been downvoted twice, quiet every other currently-active
  -- item of the same pattern rather than making the user downvote each one.
  if next_strength >= 2 then
    update public.prep_items
    set dismissed = true,
        dismissed_at = now_ts
    where dismissed = false
      and source_pattern_key = v_pattern_key;
  end if;

  return resolution || jsonb_build_object('pattern_key', v_pattern_key, 'suppression_strength', next_strength, 'hard_suppressed', hard_suppressed);
end;
$$;

revoke all on function public.record_prep_item_downvote(uuid)
  from public, anon, authenticated;
grant execute on function public.record_prep_item_downvote(uuid)
  to anon, authenticated, service_role;
