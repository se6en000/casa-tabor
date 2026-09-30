-- Directions to someone: one answer to "where does this person live", against the real database, rolled back.
-- Run: (echo 'begin;'; cat supabase/migrations/20261001090000_contact_directory.sql this; echo 'rollback;') | bash scripts/supabase-cli.sh db query --linked -f /dev/stdin
-- It ends with "ALL PASSED" (raised, so the transaction is thrown away) or the first "FAIL n".
do $$
declare v_own uuid; v_main uuid; v_linked uuid; v_none uuid; v_p1 uuid; v_p2 uuid; v_p3 uuid;
begin
  insert into saved_places (name, address, city, state, zip) values ('ZZ Main House', '1 Main St', 'West Palm Beach', 'FL', '33401') returning id into v_p1;
  insert into saved_places (name, address, city, state, zip) values ('ZZ Alice House', '8255 West Lake Drive', 'Lake Clark Shores', 'FL', '33406') returning id into v_p2;
  insert into saved_places (name, address) values ('ZZ Old House', '9 Old Rd') returning id into v_p3;
  insert into saved_contacts (name, address, confirmed) values ('ZZ Own', '5 Own Ave, Jupiter', true) returning id into v_own;
  insert into saved_contacts (name, primary_place_id, confirmed) values ('ZZ Main', v_p1, true) returning id into v_main;
  insert into saved_contacts (name, confirmed) values ('ZZ Linked', true) returning id into v_linked;
  insert into saved_contacts (name, confirmed) values ('ZZ None', true) returning id into v_none;
  -- Alice's case: her house is a place confirmed for her; an older guess was dismissed.
  insert into contact_place_relationships (contact_id, place_id, relationship, confirmed, source) values (v_linked, v_p2, 'provider_location', true, 'manual');
  insert into contact_place_relationships (contact_id, place_id, relationship, confirmed, source, dismissed_at) values (v_linked, v_p3, 'provider_location', true, 'derived', now());
  insert into contact_place_relationships (contact_id, place_id, relationship, confirmed, source) values (v_none, v_p3, 'provider_location', false, 'derived');

  -- 1: the contact's own address
  if (select address from contact_directory where id = v_own) <> '5 Own Ave, Jupiter' then raise exception 'FAIL 1'; end if;
  -- 2: its main place, with the city line
  if (select address from contact_directory where id = v_main) <> '1 Main St, West Palm Beach, FL 33401' or (select place_name from contact_directory where id = v_main) <> 'ZZ Main House' then raise exception 'FAIL 2 %', (select address from contact_directory where id = v_main); end if;
  -- 3: a confirmed place for it (Alice), never a dismissed one
  if (select address from contact_directory where id = v_linked) <> '8255 West Lake Drive, Lake Clark Shores, FL 33406' then raise exception 'FAIL 3 %', (select address from contact_directory where id = v_linked); end if;
  -- 4: an unconfirmed guess is not an address
  if (select address from contact_directory where id = v_none) is not null then raise exception 'FAIL 4'; end if;
  -- 5: a place with only a street reads as the street
  if public.place_full_address((select p from saved_places p where id = v_p3)) <> '9 Old Rd' then raise exception 'FAIL 5'; end if;
  raise exception 'ALL PASSED';
end $$;
