create or replace function public.recurrence_build_reusable_patch(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with snapshot as (
    select public.recurrence_build_event_snapshot(p_event_id) value
  ),
  normalized as (
    select
      value,
      jsonb_set(
        case
          when jsonb_typeof(value->'enrichment') = 'object' then value->'enrichment'
          else '{}'::jsonb
        end,
        '{what_to_bring}',
        case
          when jsonb_typeof(value#>'{enrichment,what_to_bring}') = 'array'
            then value#>'{enrichment,what_to_bring}'
          else '[]'::jsonb
        end,
        true
      ) as enrichment
    from snapshot
  )
  select jsonb_build_object(
    'event', value->'event',
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'family_member_id', member->>'family_member_id',
        'role', member->>'role'
      ))
      from jsonb_array_elements(value->'members') member
    ), '[]'::jsonb),
    'enrichment', enrichment,
    'transportation_plan', value#>'{plan_override,transportation_plan}',
    'logistics', value->'logistics',
    'checklist_definitions', coalesce((
      select jsonb_agg(item - 'id' - 'event_id' - 'checked' - 'created_at')
      from jsonb_array_elements(value->'checklist_items') item
    ), '[]'::jsonb),
    'action_definitions', coalesce((
      select jsonb_agg(item - 'id' - 'event_id' - 'due_date' - 'completed' - 'completed_at' - 'created_at')
      from jsonb_array_elements(value->'action_items') item
    ), '[]'::jsonb)
  )
  from normalized;
$$;

revoke all on function public.recurrence_build_reusable_patch(uuid) from public, anon, authenticated;
grant execute on function public.recurrence_build_reusable_patch(uuid) to service_role;
