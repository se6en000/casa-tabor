-- Preserve stable transaction identity across vendor lifecycle emails. Vendor
-- alone is intentionally never a thread key because households can have
-- multiple simultaneous orders from the same merchant.

alter table public.prep_items
  add column if not exists attention_thread_key text,
  add column if not exists attention_vendor text,
  add column if not exists attention_stage text;

create index if not exists prep_items_attention_thread_idx
  on public.prep_items (attention_thread_key, created_at desc)
  where attention_thread_key is not null and dismissed = false;

with walmart_rows as (
  select
    id,
    source_ref,
    lower(concat_ws(' ', event_title, description)) as content,
    (
      regexp_match(
        lower(concat_ws(' ', event_title, description)),
        'order[^0-9a-z]{0,20}#?([0-9]{5,}(?:-[0-9]{2,})+)'
      )
    )[1] as order_id
  from public.prep_items
  where source_type = 'gmail'
    and lower(concat_ws(' ', event_title, description)) ~ '(walmart|inhome)'
)
update public.prep_items as item
set
  attention_vendor = 'Walmart',
  attention_thread_key = 'transaction:walmart:' ||
    case
      when walmart_rows.order_id is not null then walmart_rows.order_id
      else 'message:' || walmart_rows.source_ref
    end,
  attention_stage = case
    when item.type = 'cancellation'
      or walmart_rows.content ~ '(cancelled|canceled|failed|problem|missing|damaged)' then 'problem'
    when item.type = 'payment' then 'payment'
    when walmart_rows.content ~ 'delivered' then 'delivered'
    when walmart_rows.content ~ 'out for delivery' then 'out_for_delivery'
    when walmart_rows.content ~ 'shipped' then 'shipped'
    when walmart_rows.content ~ '(confirmed|scheduled|placed)' then 'confirmed'
    else null
  end
from walmart_rows
where item.id = walmart_rows.id
  and walmart_rows.source_ref is not null;
