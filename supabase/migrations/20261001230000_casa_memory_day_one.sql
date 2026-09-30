-- Casa's memory: day-one learned facts (Claude, 2026-09-30, from the calendar Apr–Dec 2026, the school routines and
-- 120 days of email; Jake: "do some digging and fill out the initial facts fairly well"). Sure = two kinds of
-- evidence, or the calendar 5+ times over 3+ weeks; else not sure yet.
insert into public.casa_memory (about_label, about_member_id, text, words, confidence, source, evidence)
select v.about, (select id from public.family_members where name = v.member), v.text, v.words, v.conf, 'learned', v.ev::jsonb
from (values
  -- Emme
  ('Emme','Emme','School day 8:00 to 3:30 on weekdays; Jake drops her off, Giselle picks her up', array[]::text[], 'sure', '[{"what":"her school routine"}]'),
  ('Emme','Emme','Her 4th-grade teacher is Christyna Turner', array['Turner','4th grade'], 'sure', '[{"what":"8 emails from Christyna Turner (Welcome to 4th grade!, Emme absence, Emme dismissal)","when":"Aug–Sep 2026"}]'),
  ('Emme','Emme','Plays violin in Beethoven Strings at Palm Beach Public, with early-morning practice before school (she carpools with Skylar)', array['violin','Beethoven Strings','strings','early violin'], 'sure', '[{"what":"11 emails from Randolph Smith (Beethoven Strings)"},{"what":"early violin on the calendar, Sep 2026"}]'),
  ('Emme','Emme','Practices violin with Meredith on Fridays at 4:30', array['Meredith','violin'], 'sure', '[{"what":"20 practices on the calendar","when":"Aug–Dec 2026"}]'),
  ('Emme','Emme','Tutoring with Miss Rabadeau on Tuesdays at 5:30, at home, with Liv', array['Rabadeau','Mrs Rab','tutoring'], 'not_sure', '[{"what":"2 sessions on the calendar","when":"Sep 22 and 29"}]'),
  -- Liv
  ('Liv','Liv','School day 8:00 to 3:30 on weekdays; Kelly drops her off, Giselle picks her up', array[]::text[], 'sure', '[{"what":"her school routine"}]'),
  ('Liv','Liv','Plays softball for the Huskies in the Lake Lytal Lassie League; practices Mondays and Wednesdays at 6 at Lake Lytal Park, games there too', array['Huskies','Lassie League','Lake Lytal','softball'], 'sure', '[{"what":"16 Huskies practices and games on the calendar","when":"Jul–Nov 2026"},{"what":"Fall 2026 Softball Confirmation email from the Lassie League"}]'),
  ('Liv','Liv','In 8th grade', array['8th grade','eighth grade'], 'not_sure', '[{"what":"Bak eighth-grade emails, one forwarded by Jake","when":"Sep 2026"}]'),
  ('Liv','Liv','Batting practice with Coach Danny at Shoot Straight, West Palm Beach', array['Coach Danny','batting practice'], 'sure', '[{"what":"9 sessions on the calendar","when":"May–Jul 2026"}]'),
  ('Liv','Liv','Played for Team Fury in the summer (practices at Ferrin Park)', array['Fury','Team Fury'], 'not_sure', '[{"what":"4 practices on the calendar","when":"Jun–Jul 2026"}]'),
  -- Owen
  ('Owen','Owen','School day 7:35 to 2:00 on weekdays; Jake drops him off, Giselle picks him up', array[]::text[], 'sure', '[{"what":"his school routine"}]'),
  ('Owen','Owen','His kindergarten teacher is Mrs. Rosangela (Rose) Paine; the class is called K by the Sea', array['Paine','K by the Sea','Kindergarten by the Sea'], 'sure', '[{"what":"23 emails from Rosangela Paine","when":"Aug–Sep 2026"},{"what":"the field-trip flyer"}]'),
  ('Owen','Owen','Has ABA therapy at Hope Center for Behavior Change; his therapist is Towhid Nishat', array['Hope Center','HCBC','ABA','Towhid'], 'sure', '[{"what":"8 emails from Towhid Nishat"},{"what":"Hope Center on the calendar all summer"}]'),
  ('Owen','Owen','Turned 6 in July 2026 (party at Greenacres Bowl)', array[]::text[], 'sure', '[{"what":"emails about his 6th birthday party","when":"Jul 2026"}]'),
  -- Jake, Kelly, Giselle
  ('Jake','Jake','Works 9 to 5 on weekdays', array[]::text[], 'sure', '[{"what":"his working hours"}]'),
  ('Jake','Jake','His dentist is Dr. John S. Ledakis', array['Ledakis'], 'sure', '[{"what":"4 appointments on the calendar","when":"Jun–Oct 2026"}]'),
  ('Jake','Jake','Goes to Amped Fitness Signature (the gym; plays pickleball there too)', array['Amped'], 'sure', '[{"what":"gym sessions on the calendar","when":"May–Oct 2026"}]'),
  ('Jake','Jake','His doctor is M. Michael Hanna, DO', array['Hanna'], 'not_sure', '[{"what":"a doctor follow-up on the calendar"}]'),
  ('Kelly','Kelly','Works 7:30 to 6:30 on weekdays', array[]::text[], 'sure', '[{"what":"her working hours"}]'),
  ('Kelly','Kelly','Goes to Amped Fitness Signature (the gym)', array['Amped','KT Gym'], 'sure', '[{"what":"gym sessions on the calendar","when":"May–Oct 2026"}]'),
  ('Kelly','Kelly','Does yoga at Thrive Power Yoga Palm Beach, Saturdays', array['Thrive','yoga'], 'not_sure', '[{"what":"2 classes on the calendar","when":"Sep 2026"}]'),
  ('Giselle','Giselle','The family''s caregiver: picks up Emme and Owen at Palm Beach Public and Liv at Bak on weekdays; watched Owen at Hope Center over the summer', array[]::text[], 'sure', '[{"what":"the three school routines"},{"what":"Owen with Giselle, 33 times on the calendar","when":"Jun–Aug 2026"}]'),
  -- The pets
  ('Gilbert',null,'A family pet: takes a daily pill and sees the vet', array['Gilbert'], 'sure', '[{"what":"vet appointments and pill reminders on the calendar"},{"what":"a vet invoice for Gilbert"}]'),
  ('Milo','Milo','Goes to the groomer', array['groomer','grooming'], 'not_sure', '[{"what":"grooming drop-offs on the calendar","when":"Jun–Oct 2026"}]'),
  -- The kids, and the people around them
  ('The kids',null,'Emme and Liv both see McCranels Orthodontics', array['McCranels'], 'sure', '[{"what":"McCranels emails about Emme and Liv","when":"Jun–Sep 2026"},{"what":"orthodontic visits on the calendar"}]'),
  ('The kids',null,'The dentist may be spelled Dr. Warnock (the same as Dr. Wanuk?)', array['Warnock'], 'not_sure', '[{"what":"to-dos: call Dr. Warnock about the kids'' dentist and Owen''s teeth"}]'),
  ('The kids',null,'Pediatrician: Pediatric Associates', array['Pediatric Associates'], 'not_sure', '[{"what":"to-dos to call Pediatric Associates"}]'),
  ('Sally Rozanski',null,'Principal of Bak Middle School of the Arts (Liv''s school); writes to Bak families', array['Rozanski'], 'sure', '[{"what":"A Message from Principal Rozanski (Bak MSOA Foundation)"},{"what":"17 emails to Bak families"}]'),
  ('Randolph Smith',null,'Runs Beethoven Strings at Palm Beach Public (Emme''s violin)', array['Beethoven Strings'], 'sure', '[{"what":"11 emails about Beethoven Strings and the Strings Festival"}]'),
  ('Lynita Butler',null,'Sends Palm Beach Public''s school-wide news (book fair, testing, afterschool)', array[]::text[], 'not_sure', '[{"what":"35 school-wide emails","when":"Aug–Sep 2026"}]'),
  ('Coach Glen',null,'A softball coach of Liv''s', array['Glen','Glenn'], 'not_sure', '[{"what":"Softball Practice With Glen, and a to-do to text Coach Glenn","when":"May–Jun 2026"}]')
) as v(about, member, text, words, conf, ev)
where not exists (select 1 from public.casa_memory m where m.about_label = v.about and m.text = v.text);
