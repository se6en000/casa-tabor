# Dynamic Few-Shot Exemplar Store Subsystem — Investigation & Design Report

**Milestone**: Milestone 4 (Autonomous Active-Learning Ingestion Engine)  
**Agent**: Explorer M4-2  
**Date**: 2026-08-23  
**Status**: COMPLETE  

---

## 1. Observation

### 1.1 Existing Database Migrations & Conventions
A comprehensive survey of `supabase/migrations/` (94 migration files) and existing schema standards reveals:
- **Primary Keys & UUIDs**: Standardized on `uuid primary key default gen_random_uuid()`.
- **Timestamps & Triggers**: All tables maintain `created_at timestamptz not null default now()` and `updated_at timestamptz not null default now()`, backed by `execute function public.set_updated_at()`.
- **Row-Level Security (RLS)**: Internal household tables (e.g. `public.household_capture_rules` in `20260816020000_household_capture_rules.sql`) enable RLS with permissive policies for `authenticated, anon, service_role` to support edge functions, scheduled background jobs, and local kiosk sidecars without authentication friction.
- **Vector & Full-Text Search Extensions**:
  - `vector` extension exists in `extensions` schema (`20260807190000_family_data_evidence_index.sql`).
  - `pg_trgm` extension is active (`20260805170000_household_directory_confirm_and_fuzzy_match.sql`).
  - Generated `tsvector` columns with GIN indexing are standard for fast lexical matching (e.g. `family_data_chunks.search_vector`).

### 1.2 Existing Edge Functions & Ingestion Flow
Inspection of `supabase/functions/scan-gmail-inbox/index.ts` and `supabase/functions/_shared/`:
- **Current Prompt Architecture**: `scan-gmail-inbox` dynamically queries `household_capture_rules` and injects natural language directives into the Gemini prompt (`classifyEmail` and `extractInboxActions`).
- **Identified Gap**: There is currently **no structured runtime few-shot exemplar retriever**. The LLM prompt relies on static system prompts and rule strings, which leads to ambiguity when processing complex vendor order numbers (e.g., Walmart 15/16-digit IDs vs Amazon 17-digit IDs), compound multi-event newsletters (Bak MSOA Curriculum Night), or perishable logistics (HelloFresh, Walmart InHome).
- **Interface Alignment**: `PROJECT.md` §2 specifies the `FewShotExemplar` interface:
  ```typescript
  export interface FewShotExemplar {
    id: string;
    domain: string;
    senderPattern?: string;
    emailArchetype: 'logistics_parcels' | 'executive_actions' | 'temporal_appointments' | 'lifecycle_updates' | 'estate_knowledge' | 'promotional_noise';
    sampleSubject: string;
    sampleSnippet: string;
    extractedOutput: Record<string, unknown>;
    exemplarWeight: number;
  }
  ```
- **Ground-Truth Benchmark Grounding**: `tests/fixtures/email-benchmark.json` provides 210 validated test cases across all 6 archetypes that serve as direct empirical ground truth for golden exemplar seeds.

---

## 2. Logic Chain

### 2.1 Schema Design: `public.household_few_shot_exemplars`
To support high-performance dynamic exemplar lookup and ranking:
1. **Domain & Sender Pattern Indexing**: Lookups first attempt exact domain match (`lower(domain)`), followed by sender regex/wildcard pattern matching (`lower(sender_pattern)`), followed by general archetype matching.
2. **Search Vector Column**: A generated column `search_vector tsvector generated always as (to_tsvector('english', coalesce(sample_subject, '') || ' ' || coalesce(sample_snippet, ''))) stored` indexed with GIN allows lightning-fast full-text and subject similarity filtering directly in PostgreSQL.
3. **Weight & Active Filtering**: The composite index `(email_archetype, exemplar_weight desc) where active = true` ensures only active, high-confidence exemplars are fetched.

### 2.2 Pure ESM Retrieval Module Design: `few-shot-exemplar-store.mjs`
To guarantee compatibility across Supabase Edge Functions (Deno) and the Node.js test runner with zero external dependencies:
1. **Multi-Factor Scoring Heuristic**:
   $$\text{Score} = (\text{DomainScore} + \text{SenderScore} + \text{ArchetypeScore} + \text{SubjectSimilarity} \times 25 + \text{SnippetOverlap} \times 15) \times \text{Weight}$$
   - Exact Domain match: `+40 pts`
   - Domain Substring / Suffix match: `+25 pts`
   - Sender Pattern match: `+30 pts`
   - Archetype Match (if targeted): `+20 pts`
   - Subject Token Jaccard Similarity: `0 – 25 pts`
   - Keyword / Entity Snippet Co-occurrence: `0 – 15 pts`
   - Weight Multiplier: `exemplar_weight` (1.0 = standard, 1.2+ = golden benchmark, 0.8 = low-confidence learned).
2. **Fallback Strategy**:
   - **Level 1**: Exact domain + high subject similarity (e.g. `walmart.com` grocery confirmation).
   - **Level 2**: Same domain, alternate archetype / transaction type.
   - **Level 3**: Domain wildcard `*` for the target archetype (e.g. generic e-commerce parcel for unknown retail shop).
   - **Level 4**: Built-in in-memory golden seed fallback if the database table is empty or offline during unit tests.
3. **In-Memory Query Cache**:
   A lightweight LRU/TTL cache (5-minute TTL) caches candidate exemplars in edge function memory to prevent redundant database roundtrips during high-volume inbox batch scans.

---

## 3. Detailed Architectural Specifications

### 3.1 Database Migration Specification
**Target File**: `supabase/migrations/20260824010000_household_few_shot_exemplars.sql`

```sql
-- Migration: Dynamic Few-Shot Exemplar Memory Store
-- Provides domain-specific runtime few-shot prompt injection for the 6 household archetypes.

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

-- Optimized query indexes
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
```

---

### 3.2 Seeding Strategy Across 6 Archetypes
The migration includes 14 initial golden exemplars covering primary edge cases:

```sql
-- Initial Golden Exemplar Seeds
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
```

---

### 3.3 Pure ESM Retrieval & Scoring Module Specification
**Target File**: `supabase/functions/_shared/few-shot-exemplar-store.mjs`

```javascript
// supabase/functions/_shared/few-shot-exemplar-store.mjs
/**
 * Dynamic Few-Shot Exemplar Memory Store & Runtime Prompt Injector
 * Pure ESM Module (zero external dependencies) for Edge Functions and Node.js test runner.
 */

// In-memory cache for edge function execution lifecycles (5 minute TTL)
let cachedExemplars = null
let cacheExpiresAt = 0
const CACHE_TTL_MS = 5 * 60 * 1000

export function extractDomainFromEmail(emailOrSender) {
  if (!emailOrSender) return ''
  const str = String(emailOrSender).trim().toLowerCase()
  const match = str.match(/@([a-z0-9.-]+\.[a-z]{2,})/i)
  if (match) return match[1]
  const domainMatch = str.match(/(?:^|\/\/)([a-z0-9.-]+\.[a-z]{2,})/i)
  return domainMatch ? domainMatch[1] : str
}

export function tokenizeText(text) {
  if (!text) return new Set()
  return new Set(
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  )
}

export function calculateJaccardSimilarity(tokensA, tokensB) {
  if (tokensA.size === 0 || tokensB.size === 0) return 0
  let intersection = 0
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++
  }
  const union = tokensA.size + tokensB.size - intersection
  return union > 0 ? intersection / union : 0
}

/**
 * Multi-factor scoring heuristic evaluating exemplar relevance to an incoming email
 */
export function scoreExemplar(exemplar, query = {}) {
  let score = 0
  const qDomain = (query.domain || extractDomainFromEmail(query.from || query.sender || '')).toLowerCase()
  const qSender = (query.from || query.sender || '').toLowerCase()
  const qSubject = (query.subject || '').toLowerCase()
  const qBody = (query.body || query.snippet || '').toLowerCase()
  const qArchetype = query.archetype || query.emailArchetype

  const exDomain = (exemplar.domain || '').toLowerCase()
  const exSender = (exemplar.sender_pattern || exemplar.senderPattern || '').toLowerCase()
  const exArchetype = exemplar.email_archetype || exemplar.emailArchetype
  const exSubject = (exemplar.sample_subject || exemplar.sampleSubject || '').toLowerCase()
  const exSnippet = (exemplar.sample_snippet || exemplar.sampleSnippet || '').toLowerCase()
  const exWeight = Number(exemplar.exemplar_weight ?? exemplar.exemplarWeight ?? 1.0)

  // 1. Exact or Subdomain Match (up to 40 pts)
  if (qDomain && exDomain) {
    if (qDomain === exDomain) {
      score += 40
    } else if (qDomain.endsWith(`.${exDomain}`) || exDomain.endsWith(`.${qDomain}`)) {
      score += 25
    } else if (qSender.includes(exDomain)) {
      score += 20
    }
  }

  // 2. Sender pattern match (up to 30 pts)
  if (qSender && exSender) {
    const cleanPattern = exSender.replace(/%/g, '')
    if (cleanPattern && qSender.includes(cleanPattern)) {
      score += 30
    }
  }

  // 3. Archetype match (20 pts)
  if (qArchetype && exArchetype && qArchetype === exArchetype) {
    score += 20
  }

  // 4. Subject Jaccard similarity (up to 25 pts)
  if (qSubject && exSubject) {
    const tokensQ = tokenizeText(qSubject)
    const tokensEx = tokenizeText(exSubject)
    const jaccard = calculateJaccardSimilarity(tokensQ, tokensEx)
    score += Math.round(jaccard * 25)
  }

  // 5. Snippet / keyword co-occurrence (up to 15 pts)
  if (qBody && exSnippet) {
    const keywords = ['waiver', 'tracking', 'order', 'flight', 'gate', 'schedule', 'doctor', 'visit', 'bill', 'due', 'delivered', 'shipped', 'cancelled', 'delay', 'swimming', 'camp', 'concussion', 'pool', 'hoa', 'sprinkler']
    let matchCount = 0
    for (const kw of keywords) {
      if (qBody.includes(kw) && exSnippet.includes(kw)) {
        matchCount++
      }
    }
    score += Math.min(15, matchCount * 5)
  }

  // Fallback baseline for domain wildcard
  if (exDomain === '*') {
    score += 10
  }

  return score * exWeight
}

/**
 * Scores, ranks, and filters candidate exemplars
 */
export function scoreAndRankExemplars(exemplars = [], query = {}, options = {}) {
  const limit = options.limit ?? 2
  const minScore = options.minScore ?? 15

  if (!Array.isArray(exemplars) || exemplars.length === 0) {
    return []
  }

  const scored = exemplars
    .filter((e) => e.active !== false)
    .map((e) => ({
      exemplar: e,
      score: scoreExemplar(e, query),
    }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)

  // Ensure diversity: avoid returning duplicate exemplars with identical subjects
  const seenSubjects = new Set()
  const result = []

  for (const item of scored) {
    const subj = (item.exemplar.sample_subject || item.exemplar.sampleSubject || '').toLowerCase()
    if (!seenSubjects.has(subj)) {
      seenSubjects.add(subj)
      result.push(item.exemplar)
      if (result.length >= limit) break
    }
  }

  return result
}

/**
 * Formats retrieved exemplars into a clean markdown prompt block
 */
export function formatFewShotPromptBlock(exemplars = []) {
  if (!Array.isArray(exemplars) || exemplars.length === 0) {
    return ''
  }

  let block = '\n### REFERENCE GOLDEN EXTRACTION EXEMPLARS:\n'
  block += 'Follow these approved structured extraction patterns for similar household messages:\n\n'

  for (let i = 0; i < exemplars.length; i++) {
    const e = exemplars[i]
    const domain = e.domain || 'general'
    const archetype = e.email_archetype || e.emailArchetype || 'unknown'
    const subject = e.sample_subject || e.sampleSubject || ''
    const snippet = e.sample_snippet || e.sampleSnippet || ''
    const output = e.extracted_output || e.extractedOutput || {}

    block += `[Example ${i + 1} | Domain: ${domain} | Archetype: ${archetype}]\n`
    block += `Input Subject: "${subject}"\n`
    block += `Input Excerpt: "${snippet.slice(0, 300)}"\n`
    block += `Expected Structured Output:\n`
    block += '```json\n'
    block += JSON.stringify(output, null, 2) + '\n'
    block += '```\n\n'
  }

  return block
}

/**
 * Hardcoded initial golden exemplars fallback (for offline tests & DB unreachability)
 */
export function getDefaultGoldenExemplars() {
  return [
    {
      id: 'seed-walmart-01',
      domain: 'walmart.com',
      sender_pattern: '%help@walmart.com%',
      email_archetype: 'logistics_parcels',
      sample_subject: 'Thanks for your InHome delivery order, Jacob',
      sample_snippet: 'Your Walmart InHome grocery order 200015480824348 ($138.65) is scheduled for delivery tomorrow between 2pm - 6pm. 27 items including fresh organic milk and produce.',
      extracted_output: {
        intent: 'skip',
        actions: [{
          type: 'delivery',
          title: 'Walmart InHome Delivery (27 items)',
          description: 'Walmart grocery delivery scheduled tomorrow between 2pm-6pm (Order #2000154-80824348)',
          due_datetime: '2026-08-24T18:00:00Z',
          priority: 1,
          agency_level: 0,
          vendor: 'Walmart',
          transaction_id: '2000154-80824348',
          transaction_status: 'confirmed',
          is_perishable: true,
          source_origin: 'email_body',
        }],
        canonical_entity: {
          vendor: 'Walmart',
          vendorKey: 'walmart',
          orderId: '2000154-80824348',
          canonicalOrderId: '2000154-80824348',
          carrier: null,
          trackingNumber: null,
          compositeThreadKey: 'transaction:walmart:2000154-80824348',
          effectiveStage: 'confirmed',
          isPerishable: true,
          agencyLevel: 0,
        },
      },
      exemplar_weight: 1.5,
      active: true,
    },
    {
      id: 'seed-amazon-01',
      domain: 'amazon.com',
      sender_pattern: '%auto-confirm@amazon.com%',
      email_archetype: 'logistics_parcels',
      sample_subject: 'Your Amazon.com order of 3 items has shipped',
      sample_snippet: 'Your order # 112-8472910-4829103 has shipped via UPS (Tracking: 1Z9999999999999999). Estimated delivery: Friday, Aug 22 by 8:00 PM.',
      extracted_output: {
        intent: 'skip',
        actions: [{
          type: 'delivery',
          title: 'Amazon Shipment #112-8472910-4829103',
          description: 'Order #112-8472910-4829103 shipped via UPS 1Z9999999999999999. Estimated delivery Friday, Aug 22.',
          due_datetime: '2026-08-22T20:00:00Z',
          priority: 1,
          agency_level: 0,
          vendor: 'Amazon',
          transaction_id: '112-8472910-4829103',
          transaction_status: 'shipped',
          policy_disclaimer: 'Return eligible within 30 days of receipt.',
          source_origin: 'email_body',
        }],
        canonical_entity: {
          vendor: 'Amazon',
          vendorKey: 'amazon',
          orderId: '112-8472910-4829103',
          canonicalOrderId: '112-8472910-4829103',
          carrier: 'ups',
          trackingNumber: '1Z9999999999999999',
          compositeThreadKey: 'transaction:amazon:112-8472910-4829103',
          effectiveStage: 'shipped',
          isPerishable: false,
          agencyLevel: 0,
        },
      },
      exemplar_weight: 1.5,
      active: true,
    },
    {
      id: 'seed-school-01',
      domain: 'palmbeachschools.org',
      sender_pattern: '%principal@palmbeachschools.org%',
      email_archetype: 'executive_actions',
      sample_subject: 'Action Required: Sign Fall 2026 Science Camp Liability Waiver for Liv',
      sample_snippet: 'Dear Parents, please complete the digital parent liability and emergency medical release waiver for the 6th Grade Science Camp. The form must be signed and returned by Sept 5, 2026.',
      extracted_output: {
        intent: 'skip',
        actions: [{
          type: 'forms',
          title: 'Sign Science Camp Liability Waiver (Liv)',
          description: 'Complete digital parent liability and emergency medical release waiver for 6th Grade Science Camp by Sept 5, 2026.',
          due_datetime: '2026-09-05T23:59:59Z',
          assigned_member: 'Liv',
          priority: 2,
          agency_level: 2,
          source_origin: 'email_body',
        }],
      },
      exemplar_weight: 1.5,
      active: true,
    },
    {
      id: 'seed-doctor-01',
      domain: 'pediatricassociates.com',
      sender_pattern: '%appointments@pediatricassociates.com%',
      email_archetype: 'temporal_appointments',
      sample_subject: 'Confirmation: Liv Annual Well-Child Visit on Sept 14 at 9:00 AM',
      sample_snippet: 'Appointment Confirmation for Liv Tabor with Dr. Hanna on Monday, September 14, 2026 at 9:00 AM. Location: Pediatric Associates Palm Beach Gardens.',
      extracted_output: {
        intent: 'new_event',
        events: [{
          title: 'Liv Annual Well-Child Visit',
          start_datetime: '2026-09-14T09:00:00-04:00',
          end_datetime: '2026-09-14T10:00:00-04:00',
          all_day: false,
          location: 'Pediatric Associates Palm Beach Gardens',
          description: 'Annual well-child checkup for Liv with Dr. Hanna',
          assigned_member: 'Liv',
        }],
      },
      exemplar_weight: 1.5,
      active: true,
    },
    {
      id: 'seed-delta-01',
      domain: 'delta.com',
      sender_pattern: '%ticketreceipt@delta.com%',
      email_archetype: 'lifecycle_updates',
      sample_subject: 'Schedule Change Alert: Flight DL1482 on Oct 14 departs 11:15 AM',
      sample_snippet: 'Important schedule update: Flight DL1482 from PBI to ATL on Oct 14, 2026 has been moved from 4:30 PM to 11:15 AM. Confirmation code # GHY82K.',
      extracted_output: {
        intent: 'update_event',
        updates_event_title: 'Flight DL1482: PBI to ATL',
        updates_event_date: '2026-10-14',
        change_summary: 'Departure time moved earlier from 4:30 PM to 11:15 AM (Confirmation # GHY82K)',
        start_datetime: '2026-10-14T11:15:00-04:00',
        end_datetime: '2026-10-14T13:10:00-04:00',
        location: 'PBI Airport',
        description: 'Delta Flight DL1482 departure time changed to 11:15 AM',
      },
      exemplar_weight: 1.5,
      active: true,
    },
    {
      id: 'seed-hoa-01',
      domain: 'taborhoa.org',
      sender_pattern: '%board@taborhoa.org%',
      email_archetype: 'estate_knowledge',
      sample_subject: 'Tabor Estates HOA: Fall 2026 Landscaping & Sprinkler Restriction Rules',
      sample_snippet: 'Town water conservation mandate: Odd numbered homes may water lawns on Wednesdays and Saturdays before 8:00 AM. Even numbered homes on Thursdays and Sundays.',
      extracted_output: {
        intent: 'skip',
        family_evidence: {
          relevant: true,
          category: 'utilities',
          summary: 'Tabor Estates HOA lawn irrigation restrictions: Odd-numbered homes water Wed/Sat before 8:00 AM; Even-numbered homes water Thu/Sun.',
          entity_names: ['Tabor Estates HOA', 'Town Water Conservation'],
          effective_at: '2026-08-19T00:00:00Z',
          privacy_class: 'standard',
          confidence: 0.95,
        },
      },
      exemplar_weight: 1.5,
      active: true,
    },
    {
      id: 'seed-promo-01',
      domain: 'williams-sonoma.com',
      sender_pattern: '%deals@williams-sonoma.com%',
      email_archetype: 'promotional_noise',
      sample_subject: 'Labor Day Cookware Sale: Save up to 50% on Le Creuset Dutch Ovens!',
      sample_snippet: 'Exclusive holiday savings! Save up to 50% on French enameled cast iron, stainless steel cookware, and cutlery. Free shipping on orders over $99.',
      extracted_output: {
        intent: 'skip',
        skip_reason: 'Promotional marketing sale without actionable household deadlines or scheduled appointments',
        actions: [],
        family_evidence: { relevant: false },
      },
      exemplar_weight: 1.5,
      active: true,
    },
  ]
}

/**
 * Fetches all active exemplars from Supabase with memory caching
 */
export async function fetchExemplars(sb) {
  const now = Date.now()
  if (cachedExemplars && now < cacheExpiresAt) {
    return cachedExemplars
  }

  if (sb && typeof sb.from === 'function') {
    try {
      const { data, error } = await sb
        .from('household_few_shot_exemplars')
        .select('*')
        .eq('active', true)
        .order('exemplar_weight', { ascending: false })

      if (!error && Array.isArray(data) && data.length > 0) {
        cachedExemplars = data
        cacheExpiresAt = now + CACHE_TTL_MS
        return data
      }
    } catch {
      // Fall through to default fallback
    }
  }

  const defaults = getDefaultGoldenExemplars()
  cachedExemplars = defaults
  cacheExpiresAt = now + CACHE_TTL_MS
  return defaults
}

/**
 * Main runtime entry point: retrieves and ranks top few-shot exemplars for prompt injection
 */
export async function retrieveFewShotExemplars(sb, query = {}, options = {}) {
  const pool = await fetchExemplars(sb)
  return scoreAndRankExemplars(pool, query, options)
}
```

---

## 4. Caveats & Assumptions

1. **Prompt Token Budget**: Injecting 2 structured JSON exemplars adds ~350–500 tokens to the Gemini / OpenAI context window. The `limit` option defaults to 2 exemplars to stay well within edge function latency (< 2.5s) and token budget limits.
2. **Dynamic Learning vs Gold Standard**: When the Active Learning Feedback Loop creates new exemplars from user interactions (e.g. from fast dismissals or title corrections), their `exemplar_weight` should default to `1.0` or `0.8`, preserving higher rank priority for the initial benchmark-validated golden exemplars (`weight >= 1.4`).
3. **Database Availability**: In edge functions during transient Supabase connectivity drops, the module gracefully falls back to `getDefaultGoldenExemplars()` without throwing errors.

---

## 5. Conclusion & Recommendations

1. **Migration Path**: Implement `supabase/migrations/20260824010000_household_few_shot_exemplars.sql` as specified, including table definition, GIN search index, RLS policies, and the 14 initial golden seeds.
2. **ESM Retriever**: Place `supabase/functions/_shared/few-shot-exemplar-store.mjs` in the shared edge function library.
3. **Integration Point**: In `supabase/functions/scan-gmail-inbox/index.ts`, invoke `retrieveFewShotExemplars` alongside `fetchHouseholdCaptureRules` to construct a unified dynamic few-shot prompt section.
4. **Test Certification**: Add dedicated unit and integration tests in `tests/active-learning-ingestion.test.mjs` verifying domain retrieval accuracy, fallback ranking, and prompt formatting.

---

## 6. Verification Method

To independently verify the implementation:
1. Run the test suite:
   ```bash
   node --test tests/active-learning-ingestion.test.mjs
   ```
2. Inspect that:
   - Queries with `walmart.com` return the Walmart InHome grocery exemplar (weight 1.5).
   - Queries with `palmbeachschools.org` return the Science Camp waiver exemplar.
   - Queries with unknown domains gracefully return archetype-matched or generic e-commerce exemplars.
   - Zero-shot empty database queries format without error (`""` empty prompt block).
   - `formatFewShotPromptBlock` outputs syntactically valid JSON markdown blocks.
