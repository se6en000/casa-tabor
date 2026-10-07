-- On the Horizon (canvas 63–64; Jake, Oct 7): what was done about an item — "✓ To-do: get crazy hair supplies ·
-- Fri Oct 16 ›", "Handled by Alexa · Reminder: Thu Oct 8, 9 AM ›" — kept with it, so the timeline shows it as done
-- and links to it; and the "fewer like this" rule a ✕ made, so Undo can take it back.
alter table public.coming_up_state add column if not exists outcome jsonb;
alter table public.coming_up_state add column if not exists rule_id uuid references public.coming_up_rules(id) on delete set null;
create index if not exists coming_up_state_rule_id_idx on public.coming_up_state(rule_id);
