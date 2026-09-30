-- One bug list, against the real database, rolled back.
-- Run: (echo 'begin;'; cat supabase/migrations/20261001110000_one_bug_list.sql this; echo 'rollback;') | bash scripts/supabase-cli.sh db query --linked -f /dev/stdin
do $$
declare v uuid; n int;
begin
  -- 1: the 15 already sent are in the list, once
  if (select count(*) from ai_bug_reports where debug_event_id is not null) <> (select count(*) from ai_drawer_debug_events where event = 'user_bug_report') then raise exception 'FAIL 1'; end if;
  -- 2: a new report from the bug button lands in the list, with its words, conversation and who sent it
  insert into ai_drawer_debug_events (event, channel, detail, page, session_id, payload)
  values ('user_bug_report', 'client', 'expected: ZZ the list shows it', 'wall', 'zz-session', '{"feedback":{"expected":"ZZ the list shows it","happened":""},"conversation":[{"role":"user","text":"ZZ hi"}],"context":{"viewer":"Jake"}}')
  returning id into v;
  if not exists (select 1 from ai_bug_reports where debug_event_id = v and title = 'ZZ the list shows it' and status = 'open' and member_name = 'Jake' and transcript->0->>'text' = 'ZZ hi') then raise exception 'FAIL 2'; end if;
  -- 3: other debug events don't
  select count(*) into n from ai_bug_reports;
  insert into ai_drawer_debug_events (event, channel, detail) values ('server_ai_assistant_start', 'server', 'ZZ not a report');
  if (select count(*) from ai_bug_reports) <> n then raise exception 'FAIL 3'; end if;
  raise exception 'ALL PASSED';
end $$;
