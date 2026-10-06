-- Adding someone (or a pet) in Settings › Family failed (Jake, Oct 6: "adding someone/pet to the family fails save"):
-- color_hex and color_name are the old app's colours, required with no default, and the new settings (rightly) don't
-- set them — the wall's colours come from the family's order or a picked pigment. A neutral default lets any add work.
alter table public.family_members alter column color_hex set default '#4A4640';
alter table public.family_members alter column color_name set default 'Stone';
