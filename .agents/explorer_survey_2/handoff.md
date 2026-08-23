# Casa Tabor Autonomous Household Email Intelligence System
## Explorer 2 Survey: Database Schema, Data Models, Persistence Layers, and Capture Rules

**Author**: Explorer 2 (Schema & Persistence Investigator)  
**Date**: 2026-08-23  
**Working Directory**: `/Users/taboj/casa-tabor/.agents/explorer_survey_2/`  
**Target File**: `/Users/taboj/casa-tabor/.agents/explorer_survey_2/handoff.md`  

---

## 1. Observation

### 1.1 Supabase Database Schema & Migration Inventory

Directly inspected Supabase migrations and schema definitions across `/Users/taboj/casa-tabor/supabase/migrations/`:

| Table Name | Primary Migration File | Key Columns & Constraints | Purpose |
|---|---|---|---|
| `household_capture_rules` | `20260816020000_household_capture_rules.sql:2-17` | `id uuid PK`, `pattern_type text check (pattern_type in ('domain', 'sender', 'subject'))`, `pattern_value text`, `rule_directive text`, `origin text check (origin in ('user_label', 'manual_teach', 'learned_feedback'))`, `confidence double precision default 1.0`, `active boolean default true`, `last_matched_at timestamptz`, `unique (pattern_type, lower(pattern_value))` | Durable rule directives injected into LLM prompt at ingest time. |
| `canonical_inbox_emails` | `20260807180000_canonical_inbox_email_knowledge.sql:4-22` | `id uuid PK`, `canonical_key text unique not null`, `gmail_thread_id text`, `internet_message_id text`, `from_email text`, `subject text`, `received_at timestamptz`, `content_fingerprint text not null`, `content_format text check in ('plain', 'html', 'none')`, `attachment_count integer default 0 check (>=0)` | Deduplicates multi-recipient family copies into a single canonical message identity. |
| `gmail_processed_messages` | `20260528000200_gmail_scan.sql:9-23`<br>`20260529000600_inbox_monitor_v2.sql:4-9`<br>`20260807180000_canonical_inbox_email_knowledge.sql:23-29`<br>`20260816020000_household_capture_rules.sql:18-21` | `id uuid PK`, `family_member_id uuid FK -> family_members(id)`, `gmail_message_id text not null`, `canonical_email_id uuid FK -> canonical_inbox_emails(id)`, `subject text`, `email_subject text`, `from_email text`, `received_at timestamptz`, `intent text default 'skip'`, `skipped_reason text`, `created_event_id uuid FK`, `updated_event_id uuid FK`, `email_body text`, `is_user_labeled boolean default false`, `training_source text`, `unique(family_member_id, gmail_message_id)` | Audit trail of per-mailbox email scan passes and terminal outcomes. |
| `family_knowledge_claims` | `20260807180000_canonical_inbox_email_knowledge.sql:33-62` | `id uuid PK`, `claim_key text unique not null`, `claim_type text check in ('commitment', 'fact', 'relationship')`, `status text check in ('active', 'review', 'superseded', 'expired', 'dismissed')`, `requiredness text check in ('required', 'optional', 'fyi')`, `privacy_class text check in ('standard', 'sensitive')`, `title text not null`, `summary text`, `family_member_id uuid FK`, `event_id uuid FK`, `prep_item_id uuid FK`, `canonical_email_id uuid FK -> canonical_inbox_emails(id) on delete cascade`, `effective_at timestamptz`, `expires_at timestamptz`, `confidence numeric(4,3) default 0.8`, `metadata jsonb` | Source-backed, privacy-classified operational facts and commitments with automatic TTL expiration. |
| `prep_items` | `20260528000400_prep_items.sql:6-19`<br>`20260616000100_prep_relevance_feedback.sql:3-14`<br>`20260715251000_make_prep_completion_durable.sql:1-68`<br>`20260804194443_prep_items_assignment.sql:6-10`<br>`20260805150000_prep_category_taxonomy_and_overdue_safety_valve.sql:20-55`<br>`20260807080000_add_snooze_tracking_to_prep_items_and_conflicts.sql:7-10`<br>`20260809201500_vendor_transaction_threads.sql:5-13`<br>`20260816020000_household_capture_rules.sql:22-25` | `id uuid PK`, `event_id uuid FK -> events(id)`, `type text not null`, `category text check in ('gift_occasion', 'food_hosting', 'forms_paperwork', 'bills_payments', 'travel_trips', 'medical_health', 'household_errands', 'rsvp_response', 'general_todo')`, `emoji text default '📋'`, `description text not null`, `event_title text`, `event_date timestamptz`, `due_by timestamptz`, `priority int default 2`, `dismissed boolean default false`, `dismissed_at timestamptz`, `dismissed_reason text`, `source_type text`, `source_ref text`, `source_pattern_key text`, `source_confidence real default 0.6`, `relevance_score real default 0`, `downvoted_count int default 0`, `last_feedback_at timestamptz`, `assigned_to uuid FK -> family_members(id)`, `action_key text not null`, `attention_thread_key text`, `attention_vendor text`, `attention_stage text`, `snoozed_until timestamptz`, `snooze_count int default 0`, `last_snoozed_at timestamptz`, `is_user_labeled boolean default false`, `cluster_id text`, `agency_level int`, `policy_disclaimer text`, `unique (action_key) where dismissed = false` | The central executive action, logistics radar, and event preparation item store. |
| `prep_item_resolutions` | `20260715251000_make_prep_completion_durable.sql:69-83` | `action_key text PK`, `prep_item_id uuid FK -> prep_items(id)`, `outcome text check in ('done', 'dismissed', 'not_relevant')`, `source_type text`, `source_ref text`, `event_id uuid FK`, `action_type text not null`, `resolved_at timestamptz not null default now()`, `created_at timestamptz` | Authoritative tombstone preventing completed/dismissed action keys from regenerating. |
| `prep_item_feedback` | `20260616000100_prep_relevance_feedback.sql:15-26` | `id uuid PK`, `prep_item_id uuid FK`, `source_type text`, `source_pattern_key text`, `source_ref text`, `feedback text not null default 'not_relevant'`, `created_at timestamptz` | Active learning log recording downvotes from push notifications or sidecar UI. |
| `prep_item_suppressions` | `20260616000100_prep_relevance_feedback.sql:27-38`<br>`20260805160000_unify_prep_item_downvote_feedback.sql:48-68` | `id uuid PK`, `pattern_key text unique not null`, `strength int default 1`, `hard_suppressed boolean default false`, `last_feedback_at timestamptz`, `updated_at timestamptz` | Pattern-level suppression memory (hard suppresses after >= 3 downvotes, batch dismisses after 2). |
| `attention_topic_rules` | `20260809210000_attention_topic_learning.sql:5-10` | `signature text PK`, `topic_key text not null`, `created_at timestamptz`, `updated_at timestamptz` | User-confirmed topic signature learning to prevent over-merging. |
| `family_data_documents` | `20260807190000_family_data_evidence_index.sql:3-37` | `id uuid PK`, `source_type text check in ('email', 'event', 'reminder', 'prep', 'activity', 'person', 'place', 'relationship', 'memory')`, `source_id text not null`, `title text not null`, `redacted_text text not null`, `category text`, `entity_refs jsonb`, `occurred_at timestamptz`, `effective_at timestamptz`, `expires_at timestamptz`, `status text check in ('active', 'superseded', 'expired', 'dismissed', 'deleted')`, `confidence numeric(4,3)`, `privacy_class text check in ('standard', 'sensitive', 'excluded')`, `content_hash text not null`, `metadata jsonb`, `unique (source_type, source_id)` | PII-redacted document store for family operational evidence. |
| `family_data_chunks` | `20260807190000_family_data_evidence_index.sql:38-59` | `id uuid PK`, `document_id uuid FK -> family_data_documents(id) on delete cascade`, `chunk_index integer check (>=0)`, `redacted_text text not null`, `search_vector tsvector generated always as (to_tsvector('english', coalesce(redacted_text, '')))`, `embedding extensions.vector(768)`, `embedding_model text`, `content_hash text not null`, `unique(document_id, chunk_index)` | Hybrid search chunks (tsvector + pgvector 768 cosine HNSW index). |
| `family_data_index_queue` | `20260807190000_family_data_evidence_index.sql:60-83` | `id uuid PK`, `source_type text`, `source_id text`, `operation text check in ('upsert', 'delete')`, `status text check in ('pending', 'processing', 'completed', 'failed')`, `attempts int default 0`, `available_at timestamptz`, `locked_at timestamptz`, `locked_by text`, `unique (source_type, source_id)` | Asynchronous vector embedding indexing queue claimed via `claim_family_data_index_jobs()`. |
| `email_conflicts` | `20260529000600_inbox_monitor_v2.sql:15-37`<br>`20260807080000_add_snooze_tracking_to_prep_items_and_conflicts.sql:11-14` | `id uuid PK`, `family_member_id uuid FK`, `gmail_message_id text not null`, `event_id uuid FK`, `trip_id uuid FK`, `conflict_type text ('time_change', 'location_change', 'cancellation', 'trip_update')`, `field_name text`, `old_value text`, `new_value text`, `email_subject text`, `email_from text`, `resolved boolean default false`, `resolved_action text`, `snooze_count int default 0`, `snoozed_until timestamptz`, `last_snoozed_at timestamptz` | Explicit tracking when incoming email contradicts an existing calendar event. |

---

### 1.2 Runtime Capture Rules Matching, Querying, & Learning Flow

1. **Ingest Querying** (`supabase/functions/scan-gmail-inbox/index.ts:65-75`):
   ```typescript
   async function fetchHouseholdCaptureRules(sb: ReturnType<typeof createClient>): Promise<HouseholdCaptureRule[]> {
     const { data, error } = await sb.from('household_capture_rules').select('*').eq('active', true)
     if (!error && Array.isArray(data)) return data
     // Fallback to settings table if table migration not present
     const { data: setting } = await sb.from('settings').select('value').eq('key', 'household_capture_rules').maybeSingle()
     return setting?.value ?? []
   }
   ```
2. **Matching Engine** (`supabase/functions/scan-gmail-inbox/index.ts:110-127`):
   - Compares email `from` and `subject` against `pattern_value` for `'domain'`, `'sender'`, and `'subject'`.
   - Matching rules are formatted as text:
     ```text
     HOUSEHOLD LEARNED RULES FOR THIS SENDER:
     - [domain: palmbeachschools.org] Always scan emails from @palmbeachschools.org for calendar events, open houses, forms, deadlines...
     ```
   - Injected into prompts for both `classifyEmail` (line 409) and `extractInboxActions` (line 497).
3. **Multi-Channel Runtime Learning**:
   - **Gmail Label Channel** (`scan-gmail-inbox/index.ts:1332-1354`): If email has label `Casa`, automatically extracts sender domain (excluding generic providers like gmail/yahoo/icloud) or exact sender, and calls `persistLearnedCaptureRule` with `origin: 'user_label'`, `confidence: 1.0`.
   - **Kiosk/Mobile Inspection Sidecar Channel** (`src/components/canvas/widgets/ActionInspectionSidecar.tsx:1650-1780`):
     - *Option 1 (Keep Waivers & Events Only)*: Saves rule with directive `"Keep waivers, medical forms, deadlines, and calendar events. Mute routine newsletters..."` and downvotes the current item.
     - *Option 2 (Track in Logistics Radar)*: Saves rule with directive `"Route package transit, shipment tracking, and grocery deliveries quietly into Logistics Radar without creating urgent Action Queue prompts."`
     - *Option 3 (Only Urgent Deadlines & Signatures)*: Saves rule directive `"Only alert on required digital signatures, legal forms, and urgent payment deadlines..."`
     - *Option 4 (Completely Mute Sender)*: Updates rule `active: false`.
   - **Assignee Learning Channel** (`src/hooks/useActionAssigneeLearning.ts:54-97`):
     - Dynamically maps domain/keywords to family members (e.g. `"fast ela reading assessment" -> "Liv"`, `"strings" -> "Emme"`, `"palmbeachschools.org" -> "Liv"`).

---

### 1.3 Order & Parcel Lifecycle Tracking, Deduplication, & Transitions

1. **Deterministic Multi-Vendor Resolution** (`src/utils/vendorTransactions.ts:42-127`):
   - **Amazon**: `\b\d{3}-\d{7}-\d{7}\b` -> canonicalized to `123-1234567-1234567`
   - **Walmart**: `\b(?:2000|1000)\d{3}-\d{8}\b` or `\b(?:2000|1000)\d{11,13}\b` -> canonicalized to `2000154-80824348`
   - **Apple**: `\bW\d{9,10}\b` -> uppercase
   - **Nike**: `\bC0\d{9,11}\b` -> uppercase
   - **HelloFresh / Meal Kits**: `\b(?:HF|GC|BA|FACT)-\d{6,10}\b` -> uppercase
   - **Target**: 10-14 digit numeric order IDs
   - **Couriers / Trackings**: UPS (`1Z[0-9A-Z]{16}`), USPS (`9[2345]\d{20,24}`), FedEx (`\d{12}|\d{15}|\d{20,22}`)
2. **Composite Key Generation**:
   - `transaction:${vendorKey}:${canonicalOrderId}` (e.g. `transaction:walmart:2000154-80824348`)
   - Fallback 1: `delivery:${vendorKey}:${dateKey}` (e.g. `delivery:walmart:2026-08-19`)
   - Fallback 2: `transaction:${vendorKey}:items:${descriptor}`
   - Fallback 3: `transaction:${vendorKey}:message:${sourceRef}`
3. **Database Progression**:
   - In `scan-gmail-inbox/index.ts:752-783`, checks for existing non-dismissed row matching `attention_thread_key`.
   - Compares stage hierarchy: `['confirmed', 'payment', 'shipped', 'out_for_delivery', 'delivered', 'problem']`.
   - If incoming update is higher or equal rank, updates existing row in place (`attention_stage`, `description`, `event_title`, `due_by`, `source_ref`).
4. **Lifecycle State Machine & Guardrails**:
   - `isClaimPolicyDisclaimer` (`vendorTransactions.ts:135`): Standard return/claim policy notices do not trigger `problem` status unless actual damage/loss occurred.
   - `isBeingPreparedOrEdited` (`vendorTransactions.ts:161`): "Being prepared" / "last minute to add items" stays in stage `confirmed`.
   - `Future Date Guardrail` (`resolveEffectiveStage` in `vendorTransactions.ts:589-597`): If delivery date is in the future (e.g., scheduled for Monday Aug 24 while today is Saturday Aug 22), order CANNOT be resolved to `delivered`.
   - `Past Auto-Resolution Guardrail` (`vendorTransactions.ts:600-607`): Only same-day courier dispatch (`out_for_delivery`) from a past day automatically transitions to `delivered`. `confirmed`, `payment`, and `shipped` never auto-resolve prematurely.
   - `Agency Level Separation` (`scan-gmail-inbox/index.ts:748`): Logistics updates receive `agency_level = 0`, directing them to Logistics Radar and preventing noise leakage into Executive Action Queue (`agency_level >= 1`).

---

### 1.4 Executive Actions, Waivers, Forms, Bills, & Temporal Appointments

1. **Storage & Taxonomy**:
   - `prep_items.category` enforced with check constraint (`forms_paperwork`, `bills_payments`, `rsvp_response`, `gift_occasion`, `medical_health`, `travel_trips`, `household_errands`, `general_todo`).
   - `prep_item_action_key(id, event_id, type, source_type, source_ref)` generates deterministic unique keys:
     - `reminder:<uuid>:reminder`
     - `gmail:<member_id>:<msg_id>:<type>`
     - `event:<event_id>:<type>`
2. **Compound Decomposer & Multimodal PDFs**:
   - `scan-gmail-inbox` runs `extractAttachmentDirectives` using Gemini 2.5 Flash on attached PDFs/Flyers (`mimeType: application/pdf`).
   - Generates `extracted_document_summary` containing dates, waivers, fees, and equipment rules.
   - Extracts all calendar dates into `events: ExtractedEventItem[]` -> persisted via `persistEventSuggestions` (`type: 'appointment'`, `attention_stage: 'suggested_event'`).
   - Extracts all actionable tasks into `actions: InboxActionItem[]` -> persisted via `persistInboxActions`.
3. **Knowledge Claims Linking**:
   - `persistEmailKnowledgeClaims` inserts into `family_knowledge_claims` with `claim_key: gmail:${canonicalEmailId}:prep:${item.id}`, `canonical_email_id`, `family_member_id`, `prep_item_id`, and `expires_at: item.due_by`.
4. **Resolution Durability**:
   - `resolve_prep_item(id, outcome)` updates `prep_items.dismissed = true`, inserts into `prep_item_resolutions`, and if source was a reminder, transactionally cancels the linked reminder in `events`.
   - Database trigger `enforce_prep_item_action_identity` intercepts any attempted regeneration of an action key that already exists in `prep_item_resolutions` or active `prep_items`.

---

## 2. Logic Chain

```
[Observation 1: Multi-mailbox Gmail accounts scan into public.gmail_processed_messages]
       │
       ▼
[Observation 2: public.canonical_inbox_emails deduplicates messages by RFC Message-ID / normalized fallback hash]
       │
       ▼
[Observation 3: scan-gmail-inbox matches rules from public.household_capture_rules]
       │
       ├─────────────────────────────────┬─────────────────────────────────┐
       ▼                                 ▼                                 ▼
[Logistics & Parcels Archetype]   [Executive Actions Archetype]     [Temporal Appointments Archetype]
- Vendor & Order ID resolved       - 9-category taxonomy applied     - Suggested events extracted
- Thread key generated             - Agency level set (1, 2, 3)      - Suggestion thread keys created
- Stage hierarchy updated in-place - Action key uniqueness enforced  - Fuzzy matched against events
- Agency level = 0 (Radar only)    - family_knowledge_claims linked  - 1-tap calendar creation in UI
       │                                 │                                 │
       └─────────────────────────────────┼─────────────────────────────────┘
                                         ▼
                [Active Learning & Feedback Ingestion]
                - User labeled 'Casa' -> persists capture rule
                - Kiosk Policy Modal -> tunes domain routing
                - Downvotes -> increments prep_item_suppressions
                - Assignee Picker -> updates action_assignee_learning
```

1. **From Ingest to Canonical Identity**: Multi-mailbox scanning across Jake and Kelly's Gmail accounts produces multiple raw message deliveries. `canonicalEmailKey` resolves them into `rfc:<id>` or `fallback:<sha256>`, storing a single master entry in `canonical_inbox_emails` and skipping subsequent duplicate deliveries.
2. **From Capture Rules to Extraction**: Ingest matches active rows in `household_capture_rules` and injects them directly into the LLM system prompt. This ensures domain-level routing directives (e.g. school newsletters, soccer updates, quiet logistics) guide both classification and task decomposition.
3. **From Extraction to Entity Resolution**:
   - Logistics emails are parsed with deterministic vendor regexes (`canonicalizeOrderId`), assigned composite thread keys (`transaction:${vendor}:${orderId}`), and updated in-place within `prep_items` using stage ranking to avoid duplicate cards.
   - Action items (forms, waivers, payments) are classified under the enforced 9-category taxonomy with `agency_level >= 1`, assigned stable `action_key` hashes, and linked to `family_knowledge_claims`.
   - Temporal dates are decomposed into `suggested_event` items in `prep_items` with fuzzy deduplication against existing calendar events.
4. **From Feedback to Policy Adaptation**:
   - User interactions (labeling 'Casa', downvoting items, selecting "Keep Waivers Only" in `ActionInspectionSidecar`, or assigning a child) immediately persist learned rules to `household_capture_rules`, `prep_item_suppressions`, and `settings` without requiring code redeployments or server restarts.

---

## 3. Caveats

1. **Exemplar Memory Store (R4)**: The codebase currently has `household_capture_rules` (text directives) and `family_data_documents` (vector chunks), but lacks a dedicated structured table for storing and dynamically retrieving domain-specific **few-shot prompt exemplars** (e.g. historical input/output pairs for tricky vendors).
2. **Capture Rule Origin Constraint**: `household_capture_rules.origin` currently has a check constraint restricting values to `('user_label', 'manual_teach', 'learned_feedback')`. The frontend `useHouseholdCaptureRules.ts` and `ActionInspectionSidecar.tsx` also pass `'user_untrain'`. An alter-table migration expanding the origin constraint or relaxing it is recommended.
3. **Multi-Account Linkage on Canonical Emails**: `canonical_inbox_emails` currently stores a single `gmail_thread_id` and does not have an explicit array/join table of all linked Google accounts that received the message.
4. **Dedicated Order Ledger vs. Prep Item Overloading**: Order tracking currently shares the `prep_items` table (distinguished by `attention_thread_key` and `agency_level = 0`). While this functions correctly with `vendorTransactions.ts`, high-volume email streams benefit from indexing `prep_items(attention_vendor, attention_stage)` or introducing a dedicated `canonical_vendor_orders` view/table.

---

## 4. Conclusion & Recommended Schema Extensions

### 4.1 Schema Migration Recommendations

To support the full requirements of R1–R5 (Canonical Keys, Dynamic Few-Shot Exemplar Memory, Active Learning Feedback, and Multi-Email Tracking), the following migration extensions are recommended:

#### Extension 1: Dynamic Few-Shot Exemplar Memory Table (`supabase/migrations/20260824010000_household_few_shot_exemplars.sql`)
```sql
-- Dynamic Few-Shot Exemplar Memory for Email Intelligence
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
  extracted_output jsonb not null,
  exemplar_weight double precision not null default 1.0,
  active boolean not null default true,
  last_matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_few_shot_exemplars_lookup
  on public.household_few_shot_exemplars (lower(domain), email_archetype)
  where active = true;

alter table public.household_few_shot_exemplars enable row level security;
create policy "few_shot_exemplars_all"
  on public.household_few_shot_exemplars for all
  using (true) with check (true);
```

#### Extension 2: Expand `household_capture_rules` Origin & Routing Matrix (`supabase/migrations/20260824020000_expand_capture_rules_routing.sql`)
```sql
-- Expand capture rule origins and add structured category routing
alter table public.household_capture_rules
  drop constraint if exists household_capture_rules_origin_check,
  add constraint household_capture_rules_origin_check
    check (origin in ('user_label', 'manual_teach', 'learned_feedback', 'user_untrain', 'voice_directive', 'fast_dismissal'));

alter table public.household_capture_rules
  add column if not exists default_archetype text,
  add column if not exists category_routing jsonb default '{}'::jsonb,
  add column if not exists voice_transcript text,
  add column if not exists feedback_count integer default 1;

create index if not exists idx_prep_items_vendor_stage
  on public.prep_items (attention_vendor, attention_stage)
  where attention_vendor is not null and dismissed = false;
```

#### Extension 3: Multi-Mailbox Account Association on Canonical Emails (`supabase/migrations/20260824030000_canonical_email_mailboxes.sql`)
```sql
-- Track multi-account delivery references on canonical emails
alter table public.canonical_inbox_emails
  add column if not exists mailbox_accounts text[] default array[]::text[],
  add column if not exists recipient_deliveries jsonb default '[]'::jsonb;
```

---

## 5. Verification Method

### 5.1 Automated Test Suite Verification
Run the project test suite using Node test runner:
```bash
npm test
```
**Expected baseline**: 1,698 passing tests, 0 failures.

### 5.2 Specific Subsystem Tests to Verify
1. **Vendor Transactions & Order Canonicalization**:
   ```bash
   node --test tests/vendor-transaction-producer.test.mjs
   ```
2. **Canonical Email Key & RFC Deduplication**:
   ```bash
   node --test tests/gmail-canonical-email.test.mjs
   ```
3. **Cross-Inbox Deduplication & Knowledge Claims**:
   ```bash
   node --test tests/gmail-cross-inbox-dedupe.test.mjs
   ```
4. **Action Durability & Transactional Resolution**:
   ```bash
   node --test tests/prep-action-completion.test.mjs
   ```
5. **Taxonomy, Categories, & Overdue Visibility**:
   ```bash
   node --test tests/prep-taxonomy-and-overdue-visibility-fix.test.mjs
   ```
6. **Assignee Learning**:
   ```bash
   node --test tests/action-assignee-learning.test.mjs
   ```
7. **Action Queue Sidecar Inspection**:
   ```bash
   node --test tests/action-queue-sidecar-inspection.test.mjs
   ```

### 5.3 Invalidation Conditions
- Any changes to `canonicalizeOrderId` or `transactionIdentity` that fail to normalize hyphenated Walmart or Amazon order numbers.
- Any regression that allows passive logistics tracking (e.g. shipping updates, claims policy disclaimers) to be assigned `agency_level >= 1`, causing noise in the Executive Action Queue.
- Any regression that auto-resolves future-dated orders (e.g. scheduled for Monday) to `delivered` on the preceding day.
