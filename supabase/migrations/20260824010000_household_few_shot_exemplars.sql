-- ============================================================================
-- Migration: 20260824010000_household_few_shot_exemplars.sql
-- Subsystem: Milestone 4 Dynamic Few-Shot Exemplar Memory Store
-- Description: Creates household_few_shot_exemplars table, indexes, RLS, triggers,
--              and 14 golden seed exemplars across the 6 household archetypes.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.household_few_shot_exemplars (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  sender_pattern text,
  email_archetype text not null check (
    email_archetype in (
      'logistics_parcels',
      'executive_actions',
      'temporal_appointments',
      'lifecycle_updates',
      'estate_knowledge',
      'promotional_noise'
    )
  ),
  sample_subject text not null,
  sample_snippet text not null,
  extracted_output jsonb not null default '{}'::jsonb,
  exemplar_weight double precision not null default 1.0 check (exemplar_weight >= 0),
  active boolean not null default true,
  search_vector tsvector generated always as (
    to_tsvector('english', coalesce(sample_subject, '') || ' ' || coalesce(sample_snippet, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Query performance indexes
create index if not exists idx_few_shot_exemplars_domain_archetype
  on public.household_few_shot_exemplars (lower(domain), email_archetype)
  where active = true;

create index if not exists idx_few_shot_exemplars_archetype_weight
  on public.household_few_shot_exemplars (email_archetype, exemplar_weight desc)
  where active = true;

create index if not exists idx_few_shot_exemplars_sender
  on public.household_few_shot_exemplars (lower(sender_pattern))
  where sender_pattern is not null and active = true;

create index if not exists idx_few_shot_exemplars_search
  on public.household_few_shot_exemplars using gin(search_vector);

-- Enable RLS
alter table public.household_few_shot_exemplars enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'household_few_shot_exemplars'
      and policyname = 'household_few_shot_exemplars_all'
  ) then
    create policy household_few_shot_exemplars_all
      on public.household_few_shot_exemplars
      for all
      to authenticated, anon, service_role
      using (true)
      with check (true);
  end if;
end $$;

-- Updated at trigger
drop trigger if exists household_few_shot_exemplars_updated_at on public.household_few_shot_exemplars;
create trigger household_few_shot_exemplars_updated_at
  before update on public.household_few_shot_exemplars
  for each row execute function public.set_updated_at();

-- Initial Golden Exemplar Seeds (14 Golden Seeds Across All 6 Archetypes)
insert into public.household_few_shot_exemplars 
  (domain, sender_pattern, email_archetype, sample_subject, sample_snippet, extracted_output, exemplar_weight, active)
values
  -- 1. Logistics & Parcels (Walmart InHome Grocery)
  (
    'walmart.com',
    '%help@walmart.com%',
    'logistics_parcels',
    'Thanks for your InHome delivery order, Jacob',
    'Your Walmart InHome grocery order 200015480824348 ($138.65) is scheduled for delivery tomorrow between 2pm - 6pm. 27 items including fresh organic milk and produce.',
    '{
      "intent": "skip",
      "actions": [{
        "type": "delivery",
        "title": "Walmart InHome Delivery (27 items)",
        "description": "Walmart grocery delivery scheduled tomorrow between 2pm-6pm (Order #2000154-80824348)",
        "due_datetime": "2026-08-24T18:00:00Z",
        "priority": 1,
        "agency_level": 0,
        "vendor": "Walmart",
        "transaction_id": "2000154-80824348",
        "transaction_status": "confirmed",
        "is_perishable": true,
        "source_origin": "email_body"
      }],
      "canonical_entity": {
        "vendor": "Walmart",
        "vendorKey": "walmart",
        "orderId": "2000154-80824348",
        "canonicalOrderId": "2000154-80824348",
        "carrier": null,
        "trackingNumber": null,
        "compositeThreadKey": "transaction:walmart:2000154-80824348",
        "effectiveStage": "confirmed",
        "isPerishable": true,
        "agencyLevel": 0
      }
    }'::jsonb,
    1.5,
    true
  ),

  -- 2. Logistics & Parcels (Amazon UPS Shipped)
  (
    'amazon.com',
    '%auto-confirm@amazon.com%',
    'logistics_parcels',
    'Your Amazon.com order of 3 items has shipped',
    'Your order # 112-8472910-4829103 has shipped via UPS (Tracking: 1Z9999999999999999). Estimated delivery: Friday, Aug 22 by 8:00 PM.',
    '{
      "intent": "skip",
      "actions": [{
        "type": "delivery",
        "title": "Amazon Shipment #112-8472910-4829103",
        "description": "Order #112-8472910-4829103 shipped via UPS 1Z9999999999999999. Estimated delivery Friday, Aug 22.",
        "due_datetime": "2026-08-22T20:00:00Z",
        "priority": 1,
        "agency_level": 0,
        "vendor": "Amazon",
        "transaction_id": "112-8472910-4829103",
        "transaction_status": "shipped",
        "policy_disclaimer": "Return eligible within 30 days of receipt.",
        "source_origin": "email_body"
      }],
      "canonical_entity": {
        "vendor": "Amazon",
        "vendorKey": "amazon",
        "orderId": "112-8472910-4829103",
        "canonicalOrderId": "112-8472910-4829103",
        "carrier": "ups",
        "trackingNumber": "1Z9999999999999999",
        "compositeThreadKey": "transaction:amazon:112-8472910-4829103",
        "effectiveStage": "shipped",
        "isPerishable": false,
        "agencyLevel": 0
      }
    }'::jsonb,
    1.5,
    true
  ),

  -- 3. Logistics & Parcels (HelloFresh Perishable Meal Kit)
  (
    'hellofresh.com',
    '%delivery@hellofresh.com%',
    'logistics_parcels',
    'Your weekly meal box #HF-9928172 is on its way!',
    'Your HelloFresh meal kit order HF-9928172 has shipped via FedEx tracking 789456123012. Fresh ingredients packed on ice.',
    '{
      "intent": "skip",
      "actions": [{
        "type": "delivery",
        "title": "HelloFresh Box #HF-9928172",
        "description": "Weekly meal kit box shipped via FedEx 789456123012",
        "due_datetime": "2026-08-23T18:00:00Z",
        "priority": 1,
        "agency_level": 0,
        "vendor": "HelloFresh",
        "transaction_id": "HF-9928172",
        "transaction_status": "shipped",
        "is_perishable": true,
        "source_origin": "email_body"
      }],
      "canonical_entity": {
        "vendor": "HelloFresh",
        "vendorKey": "hellofresh",
        "orderId": "HF-9928172",
        "canonicalOrderId": "HF-9928172",
        "carrier": "fedex",
        "trackingNumber": "789456123012",
        "compositeThreadKey": "transaction:hellofresh:hf-9928172",
        "effectiveStage": "shipped",
        "isPerishable": true,
        "agencyLevel": 0
      }
    }'::jsonb,
    1.4,
    true
  ),

  -- 4. Executive Actions (School Field Trip Waiver)
  (
    'palmbeachschools.org',
    '%principal@palmbeachschools.org%',
    'executive_actions',
    'Action Required: Sign Fall 2026 Science Camp Liability Waiver for Liv',
    'Dear Parents, please complete the digital parent liability and emergency medical release waiver for the 6th Grade Science Camp. The form must be signed and returned by Sept 5, 2026.',
    '{
      "intent": "skip",
      "actions": [{
        "type": "forms",
        "title": "Sign Science Camp Liability Waiver (Liv)",
        "description": "Complete digital parent liability and emergency medical release waiver for 6th Grade Science Camp by Sept 5, 2026.",
        "due_datetime": "2026-09-05T23:59:59Z",
        "assigned_member": "Liv",
        "priority": 2,
        "agency_level": 2,
        "source_origin": "email_body"
      }]
    }'::jsonb,
    1.5,
    true
  ),

  -- 5. Executive Actions (FPL Utility Bill Due)
  (
    'fpl.com',
    '%billing@fpl.com%',
    'executive_actions',
    'Florida Power & Light: Your monthly electric bill ($241.18) is due Sept 5',
    'Your Florida Power & Light statement for account *******8492 is ready. Balance due: $241.18. Due date: September 5, 2026.',
    '{
      "intent": "skip",
      "actions": [{
        "type": "payment",
        "title": "Pay FPL Electric Bill ($241.18)",
        "description": "Monthly electric utility bill for account 8492 ($241.18) due Sept 5, 2026.",
        "due_datetime": "2026-09-05T23:59:59Z",
        "priority": 2,
        "agency_level": 2,
        "vendor": "Florida Power & Light",
        "transaction_id": "8492",
        "source_origin": "email_body"
      }]
    }'::jsonb,
    1.5,
    true
  ),

  -- 6. Executive Actions (Sports Medical Physical Form)
  (
    'jupiterunitedsoccer.com',
    '%coach@jupiterunitedsoccer.com%',
    'executive_actions',
    'Urgent: Complete FHSAA Concussion Protocol & Physical Form for Emme',
    'All competitive players must submit an updated FHSAA concussion protocol acknowledgement and sports physical before the first match. Due Aug 29.',
    '{
      "intent": "skip",
      "actions": [{
        "type": "forms",
        "title": "Submit FHSAA Concussion Form & Physical (Emme)",
        "description": "Submit updated concussion acknowledgement and sports physical for soccer before Aug 29.",
        "due_datetime": "2026-08-29T23:59:59Z",
        "assigned_member": "Emme",
        "priority": 3,
        "agency_level": 2,
        "source_origin": "email_body"
      }]
    }'::jsonb,
    1.4,
    true
  ),

  -- 7. Temporal Appointments (Doctor Visit)
  (
    'pediatricassociates.com',
    '%appointments@pediatricassociates.com%',
    'temporal_appointments',
    'Confirmation: Liv Annual Well-Child Visit on Sept 14 at 9:00 AM',
    'Appointment Confirmation for Liv Tabor with Dr. Hanna on Monday, September 14, 2026 at 9:00 AM. Location: Pediatric Associates Palm Beach Gardens.',
    '{
      "intent": "new_event",
      "events": [{
        "title": "Liv Annual Well-Child Visit",
        "start_datetime": "2026-09-14T09:00:00-04:00",
        "end_datetime": "2026-09-14T10:00:00-04:00",
        "all_day": false,
        "location": "Pediatric Associates Palm Beach Gardens",
        "description": "Annual well-child checkup for Liv with Dr. Hanna",
        "assigned_member": "Liv"
      }]
    }'::jsonb,
    1.5,
    true
  ),

  -- 8. Temporal Appointments (School Multi-Session Open House)
  (
    'palmbeachschools.org',
    '%bakmsoa.palmbeachschools.org%',
    'temporal_appointments',
    'Bak MSOA Curriculum Night & Open House: Thursday Aug 27 at 5:30 PM',
    'Join us on Thursday, August 27, 2026. 6th Grade session starts at 5:30 PM, 7th & 8th Grade session starts at 6:45 PM in the main auditorium.',
    '{
      "intent": "new_event",
      "events": [
        {
          "title": "Bak MSOA 6th Grade Curriculum Night",
          "start_datetime": "2026-08-27T17:30:00-04:00",
          "end_datetime": "2026-08-27T18:30:00-04:00",
          "all_day": false,
          "location": "Bak MSOA Main Auditorium",
          "description": "6th Grade Open House and Curriculum Night orientation session"
        },
        {
          "title": "Bak MSOA 7th & 8th Grade Curriculum Night",
          "start_datetime": "2026-08-27T18:45:00-04:00",
          "end_datetime": "2026-08-27T19:45:00-04:00",
          "all_day": false,
          "location": "Bak MSOA Main Auditorium",
          "description": "7th and 8th Grade Open House and Curriculum Night orientation session"
        }
      ]
    }'::jsonb,
    1.5,
    true
  ),

  -- 9. Lifecycle State Updates (Flight Schedule Change)
  (
    'delta.com',
    '%ticketreceipt@delta.com%',
    'lifecycle_updates',
    'Schedule Change Alert: Flight DL1482 on Oct 14 departs 11:15 AM',
    'Important schedule update: Flight DL1482 from PBI to ATL on Oct 14, 2026 has been moved from 4:30 PM to 11:15 AM. Confirmation code # GHY82K.',
    '{
      "intent": "update_event",
      "updates_event_title": "Flight DL1482: PBI to ATL",
      "updates_event_date": "2026-10-14",
      "change_summary": "Departure time moved earlier from 4:30 PM to 11:15 AM (Confirmation # GHY82K)",
      "start_datetime": "2026-10-14T11:15:00-04:00",
      "end_datetime": "2026-10-14T13:10:00-04:00",
      "location": "PBI Airport",
      "description": "Delta Flight DL1482 departure time changed to 11:15 AM"
    }'::jsonb,
    1.5,
    true
  ),

  -- 10. Lifecycle State Updates (Courier Weather Exception)
  (
    'ups.com',
    '%tracking@ups.com%',
    'lifecycle_updates',
    'UPS Exception: Severe weather delay for tracking 1Z9999999999999999',
    'Severe tropical weather has delayed transportation. Your delivery date for UPS tracking 1Z9999999999999999 has been updated to Tuesday, Aug 25.',
    '{
      "intent": "skip",
      "actions": [{
        "type": "delivery",
        "title": "UPS Delivery Delay (Weather Exception)",
        "description": "UPS tracking 1Z9999999999999999 delayed due to severe weather. Rescheduled to Tuesday, Aug 25.",
        "due_datetime": "2026-08-25T20:00:00Z",
        "priority": 1,
        "agency_level": 0,
        "vendor": "UPS",
        "transaction_id": "1Z9999999999999999",
        "transaction_status": "problem",
        "source_origin": "email_body"
      }],
      "canonical_entity": {
        "vendor": "UPS",
        "vendorKey": "ups",
        "orderId": null,
        "canonicalOrderId": null,
        "carrier": "ups",
        "trackingNumber": "1Z9999999999999999",
        "compositeThreadKey": "courier:ups:1z9999999999999999",
        "effectiveStage": "problem",
        "isPerishable": false,
        "agencyLevel": 0
      }
    }'::jsonb,
    1.4,
    true
  ),

  -- 11. Estate Context & Knowledge (HOA Landscaping & Irrigation Rules)
  (
    'taborhoa.org',
    '%board@taborhoa.org%',
    'estate_knowledge',
    'Tabor Estates HOA: Fall 2026 Landscaping & Sprinkler Restriction Rules',
    'Town water conservation mandate: Odd numbered homes may water lawns on Wednesdays and Saturdays before 8:00 AM. Even numbered homes on Thursdays and Sundays.',
    '{
      "intent": "skip",
      "family_evidence": {
        "relevant": true,
        "category": "utilities",
        "summary": "Tabor Estates HOA lawn irrigation restrictions: Odd-numbered homes water Wed/Sat before 8:00 AM; Even-numbered homes water Thu/Sun.",
        "entity_names": ["Tabor Estates HOA", "Town Water Conservation"],
        "effective_at": "2026-08-19T00:00:00Z",
        "privacy_class": "standard",
        "confidence": 0.95
      }
    }'::jsonb,
    1.5,
    true
  ),

  -- 12. Estate Context & Knowledge (Pool Chemistry Maintenance Log)
  (
    'flacleanpool.com',
    '%service@flacleanpool.com%',
    'estate_knowledge',
    'Weekly Pool Chemistry & Salt Cell Maintenance Log - August 2026',
    'Service complete: Salt level 3200 ppm, pH 7.4, Chlorine 3.0 ppm. Cleaned skimmer baskets and inspected pump timer.',
    '{
      "intent": "skip",
      "family_evidence": {
        "relevant": true,
        "category": "other_family_service",
        "summary": "Pool maintenance log: Salt 3200 ppm, pH 7.4, Chlorine 3.0 ppm, skimmers cleared.",
        "entity_names": ["Florida Clean Pool Service"],
        "effective_at": "2026-08-21T16:00:00Z",
        "privacy_class": "standard",
        "confidence": 0.9
      }
    }'::jsonb,
    1.4,
    true
  ),

  -- 13. Promotional Noise (Cookware Flash Sale)
  (
    'williams-sonoma.com',
    '%deals@williams-sonoma.com%',
    'promotional_noise',
    'Labor Day Cookware Sale: Save up to 50% on Le Creuset Dutch Ovens!',
    'Exclusive holiday savings! Save up to 50% on French enameled cast iron, stainless steel cookware, and cutlery. Free shipping on orders over $99.',
    '{
      "intent": "skip",
      "skip_reason": "Promotional marketing sale without actionable household deadlines or scheduled appointments",
      "actions": [],
      "family_evidence": { "relevant": false }
    }'::jsonb,
    1.5,
    true
  ),

  -- 14. Promotional Noise (Financial Newsletter Digest)
  (
    'morningbrew.com',
    '%newsletter@morningbrew.com%',
    'promotional_noise',
    'The Daily Brew: Tech stocks rally and markets digest rate cut signals',
    'Good morning! Markets reached fresh record highs as investors evaluated central bank commentary. Plus, retail trends this week.',
    '{
      "intent": "skip",
      "skip_reason": "General news digest and financial commentary",
      "actions": [],
      "family_evidence": { "relevant": false }
    }'::jsonb,
    1.4,
    true
  )
on conflict do nothing;
