do $$
declare
  v_signature regprocedure :=
    'public.recurrence_apply_shadow_migration(text,jsonb,jsonb)'::regprocedure;
  v_definition text;
  v_revised_definition text;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  v_revised_definition := replace(
    v_definition,
    'encode(digest(convert_to(p_plan::text, ''UTF8''), ''sha256''), ''hex'')',
    'md5(p_plan::text)'
  );
  if v_revised_definition = v_definition then
    raise exception 'Could not locate shadow migration plan hash expression';
  end if;
  execute v_revised_definition;
end;
$$;
