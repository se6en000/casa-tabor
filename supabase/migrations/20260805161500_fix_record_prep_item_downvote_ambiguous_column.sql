-- Fixes a bug in record_prep_item_downvote() (20260805160000) found during live
-- verification: the local variable `hard_suppressed` had the same name as the
-- `prep_item_suppressions.hard_suppressed` column, causing Postgres to reject
-- `set hard_suppressed = hard_suppressed` with "column reference is ambiguous"
-- (every downvote call failed with HTTP 400/42702). Renamed the local variable
-- to `v_hard_suppressed`; behavior is otherwise unchanged.

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
  v_hard_suppressed boolean;
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
  v_hard_suppressed := coalesce(existing_suppression.hard_suppressed, false) or next_strength >= 3;

  if existing_suppression.id is not null then
    update public.prep_item_suppressions
    set strength = next_strength,
        hard_suppressed = v_hard_suppressed,
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

  return resolution || jsonb_build_object('pattern_key', v_pattern_key, 'suppression_strength', next_strength, 'hard_suppressed', v_hard_suppressed);
end;
$$;

revoke all on function public.record_prep_item_downvote(uuid)
  from public, anon, authenticated;
grant execute on function public.record_prep_item_downvote(uuid)
  to anon, authenticated, service_role;
