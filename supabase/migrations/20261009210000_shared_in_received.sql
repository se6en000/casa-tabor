-- Send to Tabor House: what each share brought (form fields, file names, types, sizes) — Jake's first try came as the
-- word "Image" with no picture read, and nothing said why.
alter table public.shared_in add column if not exists received jsonb not null default '[]'::jsonb;
