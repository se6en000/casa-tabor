alter table public.event_plan_overrides
  drop constraint if exists event_plan_overrides_transportation_plan_check;

alter table public.event_plan_overrides
  add constraint event_plan_overrides_transportation_plan_check
  check (
    transportation_plan is null
    or (
      jsonb_typeof(transportation_plan) = 'object'
      and transportation_plan->>'version' = '1'
      and transportation_plan ? 'legs'
      and jsonb_typeof(transportation_plan->'legs') = 'array'
      and jsonb_array_length(transportation_plan->'legs') > 0
    )
  );
