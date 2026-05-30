-- US Federal Holidays 2025–2027
-- Inserted as all-day events with no family member owner.
-- google_event_id prefix 'us_holiday_' keeps them idempotent.

insert into public.events
  (title, start_time, end_time, all_day, status, google_event_id, google_calendar_id, source_member_id, is_enriched)
values
  -- 2025
  ('New Year''s Day',            '2025-01-01T00:00:00',  '2025-01-02T00:00:00',  true, 'confirmed', 'us_holiday_2025-01-01', 'us_holidays', null, false),
  ('Martin Luther King Jr. Day', '2025-01-20T00:00:00',  '2025-01-21T00:00:00',  true, 'confirmed', 'us_holiday_2025-01-20', 'us_holidays', null, false),
  ('Presidents'' Day',           '2025-02-17T00:00:00',  '2025-02-18T00:00:00',  true, 'confirmed', 'us_holiday_2025-02-17', 'us_holidays', null, false),
  ('Memorial Day',               '2025-05-26T00:00:00',  '2025-05-27T00:00:00',  true, 'confirmed', 'us_holiday_2025-05-26', 'us_holidays', null, false),
  ('Juneteenth',                 '2025-06-19T00:00:00',  '2025-06-20T00:00:00',  true, 'confirmed', 'us_holiday_2025-06-19', 'us_holidays', null, false),
  ('Independence Day',           '2025-07-04T00:00:00',  '2025-07-05T00:00:00',  true, 'confirmed', 'us_holiday_2025-07-04', 'us_holidays', null, false),
  ('Labor Day',                  '2025-09-01T00:00:00',  '2025-09-02T00:00:00',  true, 'confirmed', 'us_holiday_2025-09-01', 'us_holidays', null, false),
  ('Columbus Day',               '2025-10-13T00:00:00',  '2025-10-14T00:00:00',  true, 'confirmed', 'us_holiday_2025-10-13', 'us_holidays', null, false),
  ('Veterans Day',               '2025-11-11T00:00:00',  '2025-11-12T00:00:00',  true, 'confirmed', 'us_holiday_2025-11-11', 'us_holidays', null, false),
  ('Thanksgiving Day',           '2025-11-27T00:00:00',  '2025-11-28T00:00:00',  true, 'confirmed', 'us_holiday_2025-11-27', 'us_holidays', null, false),
  ('Christmas Day',              '2025-12-25T00:00:00',  '2025-12-26T00:00:00',  true, 'confirmed', 'us_holiday_2025-12-25', 'us_holidays', null, false),

  -- 2026
  ('New Year''s Day',            '2026-01-01T00:00:00',  '2026-01-02T00:00:00',  true, 'confirmed', 'us_holiday_2026-01-01', 'us_holidays', null, false),
  ('Martin Luther King Jr. Day', '2026-01-19T00:00:00',  '2026-01-20T00:00:00',  true, 'confirmed', 'us_holiday_2026-01-19', 'us_holidays', null, false),
  ('Presidents'' Day',           '2026-02-16T00:00:00',  '2026-02-17T00:00:00',  true, 'confirmed', 'us_holiday_2026-02-16', 'us_holidays', null, false),
  ('Memorial Day',               '2026-05-25T00:00:00',  '2026-05-26T00:00:00',  true, 'confirmed', 'us_holiday_2026-05-25', 'us_holidays', null, false),
  ('Juneteenth',                 '2026-06-19T00:00:00',  '2026-06-20T00:00:00',  true, 'confirmed', 'us_holiday_2026-06-19', 'us_holidays', null, false),
  ('Independence Day',           '2026-07-04T00:00:00',  '2026-07-05T00:00:00',  true, 'confirmed', 'us_holiday_2026-07-04', 'us_holidays', null, false),
  ('Labor Day',                  '2026-09-07T00:00:00',  '2026-09-08T00:00:00',  true, 'confirmed', 'us_holiday_2026-09-07', 'us_holidays', null, false),
  ('Columbus Day',               '2026-10-12T00:00:00',  '2026-10-13T00:00:00',  true, 'confirmed', 'us_holiday_2026-10-12', 'us_holidays', null, false),
  ('Veterans Day',               '2026-11-11T00:00:00',  '2026-11-12T00:00:00',  true, 'confirmed', 'us_holiday_2026-11-11', 'us_holidays', null, false),
  ('Thanksgiving Day',           '2026-11-26T00:00:00',  '2026-11-27T00:00:00',  true, 'confirmed', 'us_holiday_2026-11-26', 'us_holidays', null, false),
  ('Christmas Day',              '2026-12-25T00:00:00',  '2026-12-26T00:00:00',  true, 'confirmed', 'us_holiday_2026-12-25', 'us_holidays', null, false),

  -- 2027
  ('New Year''s Day',            '2027-01-01T00:00:00',  '2027-01-02T00:00:00',  true, 'confirmed', 'us_holiday_2027-01-01', 'us_holidays', null, false),
  ('Martin Luther King Jr. Day', '2027-01-18T00:00:00',  '2027-01-19T00:00:00',  true, 'confirmed', 'us_holiday_2027-01-18', 'us_holidays', null, false),
  ('Presidents'' Day',           '2027-02-15T00:00:00',  '2027-02-16T00:00:00',  true, 'confirmed', 'us_holiday_2027-02-15', 'us_holidays', null, false),
  ('Memorial Day',               '2027-05-31T00:00:00',  '2027-06-01T00:00:00',  true, 'confirmed', 'us_holiday_2027-05-31', 'us_holidays', null, false),
  ('Juneteenth',                 '2027-06-19T00:00:00',  '2027-06-20T00:00:00',  true, 'confirmed', 'us_holiday_2027-06-19', 'us_holidays', null, false),
  ('Independence Day',           '2027-07-05T00:00:00',  '2027-07-06T00:00:00',  true, 'confirmed', 'us_holiday_2027-07-05', 'us_holidays', null, false),
  ('Labor Day',                  '2027-09-06T00:00:00',  '2027-09-07T00:00:00',  true, 'confirmed', 'us_holiday_2027-09-06', 'us_holidays', null, false),
  ('Columbus Day',               '2027-10-11T00:00:00',  '2027-10-12T00:00:00',  true, 'confirmed', 'us_holiday_2027-10-11', 'us_holidays', null, false),
  ('Veterans Day',               '2027-11-11T00:00:00',  '2027-11-12T00:00:00',  true, 'confirmed', 'us_holiday_2027-11-11', 'us_holidays', null, false),
  ('Thanksgiving Day',           '2027-11-25T00:00:00',  '2027-11-26T00:00:00',  true, 'confirmed', 'us_holiday_2027-11-25', 'us_holidays', null, false),
  ('Christmas Day',              '2027-12-25T00:00:00',  '2027-12-26T00:00:00',  true, 'confirmed', 'us_holiday_2027-12-25', 'us_holidays', null, false)

on conflict (google_event_id) where google_event_id is not null do nothing;
