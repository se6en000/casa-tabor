-- Casa's memory, phase 1, against the real database, rolled back.
-- Run: (echo 'begin;'; cat supabase/migrations/20261001220000_casa_memory.sql this; echo 'rollback;') | bash scripts/supabase-cli.sh db query --linked -f /dev/stdin
do $$
declare v_liv uuid; r jsonb; v_a uuid; v_b uuid; n int;
begin
  select id into v_liv from family_members where name = 'Liv';
  if (select count(*) from casa_memory where source = 'old_app') <> 5 then raise exception 'FAIL 1 the five from the old app'; end if;
  if not exists (select 1 from casa_memory where about_member_id = v_liv and text like '%Bak%' and status = 'active' and confidence = 'sure') then raise exception 'FAIL 1 Liv at Bak'; end if;

  r := casa_memory_remember('Liv', v_liv, 'ZZ In 7th grade', 'fact', array['7th grade'], null, 'Jake'); v_a := (r->>'id')::uuid;
  r := casa_memory_remember('Liv', v_liv, 'ZZ In 8th grade', 'fact', array['8th grade'], v_a, 'Jake'); v_b := (r->>'id')::uuid;
  if (select status from casa_memory where id = v_a) <> 'corrected' or r->>'replaced' <> 'ZZ In 7th grade' then raise exception 'FAIL 2 correction'; end if;
  if (select replaces from casa_memory where id = v_b) <> v_a then raise exception 'FAIL 2 chain'; end if;

  r := casa_memory_undo(v_b);
  if (select status from casa_memory where id = v_a) <> 'active' or (select status from casa_memory where id = v_b) <> 'forgotten' then raise exception 'FAIL 3 undo'; end if;

  r := casa_memory_forget(v_a);
  if (select status from casa_memory where id = v_a) <> 'forgotten' or not (r->>'ok')::boolean then raise exception 'FAIL 4 forget'; end if;
  r := casa_memory_undo(v_a);
  if (select status from casa_memory where id = v_a) <> 'active' then raise exception 'FAIL 5 undo a forget'; end if;

  r := casa_memory_remember('Jake', null, 'ZZ Look at a pergola in the spring', 'thought', '{}', null, 'Jake');
  r := casa_memory_forget((r->>'id')::uuid, 'done');
  if not exists (select 1 from casa_memory where text = 'ZZ Look at a pergola in the spring' and kind = 'thought' and status = 'done') then raise exception 'FAIL 6 thought done'; end if;

  if not (select relrowsecurity from pg_class where relname = 'casa_memory') then raise exception 'FAIL 7 rls'; end if;
  if has_function_privilege('anon', 'public.casa_memory_remember(text,uuid,text,text,text[],uuid,text)', 'execute') then raise exception 'FAIL 7 anon can write'; end if;
  raise exception 'ALL PASSED';
end $$;
