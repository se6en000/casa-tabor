alter table public.family_members
  add column if not exists show_on_home_sidebar boolean;

update public.family_members
set show_on_home_sidebar = true
where show_on_home_sidebar is null;

alter table public.family_members
  alter column show_on_home_sidebar set default true,
  alter column show_on_home_sidebar set not null;
