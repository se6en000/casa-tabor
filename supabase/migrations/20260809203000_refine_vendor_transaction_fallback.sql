-- Some lifecycle emails omit the order number but repeat an exact item summary.
-- Prefer that summary over a per-message fallback so those updates share a
-- thread while different same-vendor orders remain separate.

with descriptors as (
  select
    id,
    (
      regexp_match(
        lower(concat_ws(' ', event_title, description)),
        '(?:delivered:[[:space:]]*|delivery of[[:space:]]+)(.{3,100}\+[[:space:]]*[0-9]+[[:space:]]*items?)'
      )
    )[1] as descriptor
  from public.prep_items
  where attention_vendor = 'Walmart'
    and attention_thread_key like 'transaction:walmart:message:%'
)
update public.prep_items as item
set attention_thread_key = 'transaction:walmart:items:' ||
  btrim(regexp_replace(descriptors.descriptor, '[^a-z0-9]+', '-', 'g'), '-')
from descriptors
where item.id = descriptors.id
  and descriptors.descriptor is not null;
