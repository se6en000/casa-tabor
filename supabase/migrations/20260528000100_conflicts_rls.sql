-- Allow all authenticated/anon users to read and dismiss conflicts
-- (conflicts table was created in a prior session without RLS policies)

alter table if exists public.conflicts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'conflicts' and policyname = 'family can read conflicts'
  ) then
    execute 'create policy "family can read conflicts" on public.conflicts for select using (true)';
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'conflicts' and policyname = 'family can update conflicts'
  ) then
    execute 'create policy "family can update conflicts" on public.conflicts for update using (true)';
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'conflicts' and policyname = 'service role full access conflicts'
  ) then
    execute 'create policy "service role full access conflicts" on public.conflicts for all using (true)';
  end if;
end
$$;
