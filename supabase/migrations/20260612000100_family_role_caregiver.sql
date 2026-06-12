-- Allow caregiver role in family_members.role regardless of current schema style
do $$
declare
  col_udt_name text;
  con record;
begin
  select c.udt_name
    into col_udt_name
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'family_members'
    and c.column_name = 'role';

  if col_udt_name is null then
    raise notice 'public.family_members.role not found; skipping caregiver migration';
    return;
  end if;

  -- If role uses a postgres enum, append caregiver safely.
  if col_udt_name <> 'text' and col_udt_name <> 'varchar' and col_udt_name <> 'bpchar' then
    execute format('alter type %I add value if not exists ''caregiver''', col_udt_name);
    return;
  end if;

  -- If role uses text + check constraints, replace role checks with caregiver-inclusive one.
  for con in
    select conname
    from pg_constraint
    where conrelid = 'public.family_members'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.family_members drop constraint %I', con.conname);
  end loop;

  alter table public.family_members
    add constraint family_members_role_check
    check (role in ('parent', 'child', 'caregiver'));
end
$$;

