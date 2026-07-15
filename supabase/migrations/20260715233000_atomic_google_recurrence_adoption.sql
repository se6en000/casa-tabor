create or replace function public.recurrence_adopt_google_masters_core(
  p_resource_ids uuid[],
  p_explicit boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resource_id uuid;
  v_result jsonb;
  v_created integer := 0;
  v_existing integer := 0;
begin
  if coalesce(cardinality(p_resource_ids), 0) > 2500 then
    raise exception 'Google recurring master adoption batch exceeds 2500 resources';
  end if;
  foreach v_resource_id in array coalesce(p_resource_ids, array[]::uuid[])
  loop
    v_result := public.recurrence_adopt_google_master_core(v_resource_id, p_explicit);
    if coalesce((v_result->>'created')::boolean, false) then
      v_created := v_created + 1;
    else
      v_existing := v_existing + 1;
    end if;
  end loop;
  return jsonb_build_object(
    'processed', coalesce(cardinality(p_resource_ids), 0),
    'created', v_created,
    'existing', v_existing
  );
end;
$$;

revoke all on function public.recurrence_adopt_google_masters_core(uuid[], boolean)
  from public, anon, authenticated;
grant execute on function public.recurrence_adopt_google_masters_core(uuid[], boolean)
  to service_role;
