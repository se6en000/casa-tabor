-- Keep me posted, against the real database, rolled back.
-- Run: (echo 'begin;'; cat supabase/migrations/20261001180000_email_keep_posted.sql this; echo 'rollback;') | bash scripts/supabase-cli.sh db query --linked -f /dev/stdin
do $$
declare v_rule uuid; v_row uuid;
begin
  insert into email_keep_posted (kind, sender, label, source) values ('sender', 'zz.sally@palmbeachschools.org', 'ZZ Sally', 'mattered') returning id into v_rule;
  begin
    insert into email_keep_posted (kind, sender, label) values ('sender', 'zz.sally@palmbeachschools.org', 'again');
    raise exception 'FAIL 1 the same sender twice';
  exception when unique_violation then null;
  end;
  begin
    insert into email_keep_posted (kind, label) values ('topic', 'no topic');
    raise exception 'FAIL 2 a topic rule without its topic';
  exception when check_violation then null;
  end;
  insert into email_offers (gmail_message_id, decision, status, gist, gist_tag, posted_by) values ('ZZ-posted', 'offer', 'posted', 'Fall dance Fri Oct 16', 'event', v_rule) returning id into v_row;
  update email_offers set status = 'seen' where id = v_row;
  delete from email_keep_posted where id = v_rule;
  if (select posted_by from email_offers where id = v_row) is not null then raise exception 'FAIL 3 removing the rule keeps the line'; end if;
  if (select value from settings where key = 'email_text_on_wall') <> 'true'::jsonb then raise exception 'FAIL 4 wall text setting'; end if;
  if not (select relrowsecurity from pg_class where relname = 'email_keep_posted') then raise exception 'FAIL 5 rls'; end if;
  raise exception 'ALL PASSED';
end $$;
