-- Around town's dates to know (Jake, Oct 8: "things a couple weeks out are good to know too for planning"): the day each
-- line's thing happens or is due, when it has one.
alter table public.town_news add column if not exists on_date date;
