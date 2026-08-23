# Exploration Report: Autonomous Household Email Intelligence System (R1, R3, R4)

**Working Directory**: `/Users/taboj/casa-tabor/.agents/explorer_survey_1/`  
**Project Root**: `/Users/taboj/casa-tabor`  
**Target Milestone**: Discovery, Corpus Architecture, Entity Resolution & Active-Learning Survey

---

## 1. Observation

Direct code observations from the Casa Tabor codebase across `supabase/functions/`, `supabase/migrations/`, `src/utils/`, `src/hooks/`, `src/lib/`, and `tests/`:

### 1.1 Existing Email Ingestion & Inactive / Active Pipelines
- **`supabase/functions/scan-gmail-inbox/index.ts`** (1,716 lines):
  - **Fetching & Sync Strategy** (Lines 131–196): Calls Gmail REST API (`/users/me/messages` and `/users/me/history`). Supports incremental history cursor (`historyId`), 72-hour window fallback, and custom parameters `backfill_since`, `backfill_before`, `backfill_actions_only`, and `backfill_family_evidence_only`.
  - **Dual-Pass Extraction** (Lines 1133–1154): Pulls both recent inbox messages and messages user-labeled `'Casa'` in Gmail (`getUserLabeledMessages()`).
  - **Content Decoding & Attachment Extraction** (Lines 197–276): Uses `extractGmailMessageContent` (`_shared/gmail-message-content.mjs`) to parse multipart payloads, decode base64, convert HTML entities, and strip reply history. Calls `fetchGmailAttachment` + `gemini-2.5-flash` in `extractAttachmentDirectives()` (Lines 230–275) to extract schedules, waivers, and action items from PDF/image attachments up to 5MB.
  - **Canonical Deduplication** (Lines 1170–1196): Computes cross-inbox composite key via `canonicalEmailKey()` (`rfc:<message-id>` or `fallback:<sha256>`) and content hash via `canonicalContentFingerprint()` (`_shared/gmail-canonical-email.mjs`), upserting to `public.canonical_inbox_emails`.
  - **Dual LLM Decomposition**:
    1. `classifyEmail()` (Lines 394–479): Uses `gemini-2.5-flash-lite` (or `resolveBackgroundLlmConfig`) to classify primary intent into `new_event`, `update_event`, `travel_detail`, or `skip`. Extracts compound `events` array with date anchoring strictly anchored to `EMAIL SENT DATE`.
    2. `extractInboxActions()` (Lines 481–562): Extracts granular action items into types: `forms`, `payment`, `rsvp`, `deadline`, `delivery`, `renewal`, `general` with `agency_level` (0 = passive logistics/policy disclaimers, 1-3 = active decisions/signatures), vendor, transaction status, and policy disclaimers.
  - **Travel Handoff** (Lines 1448–1530): Automatically detects travel confirmations/itineraries via domain list (`TRAVEL_SENDER_DOMAINS`) and regex (`TRAVEL_KEYWORDS`), delegating payload to `supabase/functions/scan-travel-emails`.

- **`supabase/functions/scan-travel-emails/index.ts`** (1,323 lines):
  - Ingests flight, hotel, and car rental confirmation emails from corporate travel portals (CWT, Concur, Egencia) and direct airlines.
  - Parses localized nominal clock times, transforms them into UTC using airport IATA timezone lookup (`AIRPORT_TZ` / `nominalToUTCForCalendar`), geocodes origin/destination, queries Open-Meteo for forecasts, computes drive times via OSRM, generates packing and home coverage suggestions, and updates `public.trips` and `public.events`.

### 1.2 Data Structures & Storage Tables
- **`public.canonical_inbox_emails`** (`supabase/migrations/20260807180000_canonical_inbox_email_knowledge.sql`):
  - Deduplicates identical emails delivered across multiple linked Gmail accounts (`taborfamilyemail@gmail.com` and `jacobrtabor@gmail.com`).
  - Columns: `id`, `canonical_key` (unique), `gmail_thread_id`, `internet_message_id`, `from_email`, `subject`, `received_at`, `content_fingerprint`, `content_format` (`plain`|`html`|`none`), `attachment_count`, `first_seen_at`, `last_seen_at`.
- **`public.gmail_processed_messages`** (`supabase/migrations/20260528000200_gmail_scan.sql` & `20260816020000_household_capture_rules.sql`):
  - Per-account delivery log. Columns: `id`, `family_member_id`, `gmail_message_id`, `canonical_email_id`, `subject`, `from_email`, `received_at`, `intent`, `skipped_reason`, `created_event_id`, `updated_event_id`, `email_body`, `attachments` (jsonb), `extracted_document_summary`, `is_user_labeled`, `training_source`.
- **`public.household_capture_rules`** (`supabase/migrations/20260816020000_household_capture_rules.sql`):
  - Columns: `id`, `pattern_type` (`domain`|`sender`|`subject`), `pattern_value`, `rule_directive`, `origin` (`user_label`|`manual_teach`|`learned_feedback`), `confidence`, `active`, `last_matched_at`, `created_at`, `updated_at`. Unique index on `(pattern_type, lower(pattern_value))`.
- **`public.prep_items`** (`supabase/migrations/20260528000400_prep_items.sql` et al.):
  - Core unified table for Executive Action items, reminders, and delivery tracking.
  - Columns: `id`, `event_id`, `type`, `category`, `emoji`, `description`, `event_title`, `event_date`, `due_by`, `priority`, `dismissed`, `dismissed_at`, `snoozed_until`, `source_type` (`gmail`, `calendar_ai`, etc.), `source_ref`, `source_pattern_key`, `source_confidence`, `attention_thread_key`, `attention_vendor`, `attention_stage`, `agency_level` (0-3), `policy_disclaimer`, `is_user_labeled`, `cluster_id`, `assigned_to`, `downvoted_count`, `relevance_score`, `last_feedback_at`, `action_key`.
- **`public.family_knowledge_claims`** (`supabase/migrations/20260807180000_canonical_inbox_email_knowledge.sql`):
  - Columns: `id`, `claim_key` (unique), `claim_type` (`commitment`|`fact`|`relationship`), `status` (`active`|`review`|`superseded`|`expired`|`dismissed`), `requiredness` (`required`|`optional`|`fyi`), `privacy_class`, `title`, `summary`, `family_member_id`, `event_id`, `prep_item_id`, `canonical_email_id`, `effective_at`, `expires_at`, `confidence`, `metadata`.
- **`public.family_data_documents`** (`supabase/migrations/20260807190000_family_data_evidence_index.sql`):
  - Vector/RAG evidence store for family email facts, schedules, and policies.
- **`public.prep_item_feedback` & `public.prep_item_suppressions`** (`supabase/migrations/20260805161500_fix_record_prep_item_downvote_ambiguous_column.sql`):
  - Captures downvotes (`not_relevant`) and auto-suppresses recurring patterns when suppression strength >= 2.
- **`public.attention_topic_rules`** (`supabase/migrations/20260809210000_attention_topic_learning.sql`):
  - Learned merge/separation signatures for UI action cards.

### 1.3 Vendor Parsers & Canonical Entity Extractors
- **In `scan-gmail-inbox/index.ts`** (Lines 564–670) and **`src/utils/vendorTransactions.ts`** (Lines 16–320):
  - **Supported Vendors**: Walmart, Amazon, Jiffy.com, HelloFresh, Target, Instacart, DoorDash, Uber Eats, FedEx, UPS, USPS, Nike, Apple, Sephora, Nordstrom, Pottery Barn, Williams Sonoma, Chewy.
  - **Canonical Normalizers**:
    - `canonicalizeOrderId(vendor, rawId)`:
      - Walmart: `200015480824348` or `2000154-80824348` $\rightarrow$ `2000154-80824348`
      - Amazon: `11284729104829103` $\rightarrow$ `112-8472910-4829103`
      - Apple: `w123456789` $\rightarrow$ `W123456789`
      - Nike: `c0123456789` $\rightarrow$ `C0123456789`
      - Meal kits: `HF-12345678`, `GC-12345678`
      - Couriers: UPS (`1Z[0-9A-Z]{16}`), USPS (`9[2345]\d{20,24}`), FedEx (`\d{12,22}`).
  - **Lifecycle Stages**: `confirmed` (includes "Being Prepared" and order editing windows), `payment`, `shipped`, `out_for_delivery`, `delivered`, `problem`.
  - **Tense-Aware Evaluation**: `resolveEffectiveStage()` guards future deliveries (e.g. "arriving Monday Aug 24") from prematurely marking `delivered` on Saturday Aug 22.
  - **Consolidation**: `consolidateTransitItems()` merges generic date keys `delivery:${vendor}:${date}` with explicit order keys `transaction:${vendor}:${orderId}`.
  - **Disclaimer Stripping**: Retains claims/return policies (`policy_disclaimer`) inside the delivery entity while setting `agency_level: 0` so 0% leaks into the Action Queue.

### 1.4 Dynamic Few-Shot Exemplars & Active Learning State
- **Current Prompt Injection**: `fetchHouseholdCaptureRules(sb)` queries `public.household_capture_rules` and injects matching domain/sender/subject rules directly into LLM prompts.
- **Current Feedback Capture**:
  - Email label `Casa` triggers `persistLearnedCaptureRule()` to store sender domain/address directives.
  - Thumbs down button triggers `useDownvotePrepItem()` $\rightarrow$ `record_prep_item_downvote` RPC.
  - Grouping adjustments trigger `useAttentionTopicLearning` $\rightarrow$ `attention_topic_rules`.
- **Missing Dynamic Exemplar Store**: There is currently **no runtime few-shot retrieval system** that searches a golden holdout exemplar database by vendor/domain similarity to inject few-shot exemplars dynamically. The prompts currently rely on static instructions + rule injection.

### 1.5 Verification Suite Status
- Baseline project test suite (`npm test`) runs 115 test suites across 1,698 unit/integration tests with **1,698 passing, 0 failing, 0 skipped** (executed via `node --test tests/*.test.mjs` in 7.41s).

---

## 2. Logic Chain

1. **Premise (R1 - Harvester)**: `scan-gmail-inbox` already possesses the core OAuth retrieval, history cursors, canonical RFC hashing, and backfill parameters (`backfill_since`, `backfill_before`, `backfill_actions_only`, `backfill_family_evidence_only`). To harvest 1,000+ real historical emails across connected accounts and group them into the 6 household archetypes (Logistics & Parcels, Executive Action Tasks, Temporal Appointments, Lifecycle State Updates, Estate Context & Knowledge, Promotional Noise), a batch harvesting and semantic clustering pipeline can build directly on top of `canonical_inbox_emails`, `gmail_processed_messages`, and `family_data_documents`.
2. **Premise (R2 - Empirical Benchmark)**: The repository currently does not have a `tests/fixtures/email-benchmark.json` fixture file. Generating the 200+ curated test case benchmark requires pulling canonical examples across the 6 archetypes from the harvested corpus and checking this fixture into `tests/fixtures/email-benchmark.json`.
3. **Premise (R3 - Entity & Order Resolver)**: The multi-vendor canonicalization logic in `supabase/functions/scan-gmail-inbox/index.ts` and `src/utils/vendorTransactions.ts` already handles Walmart, Amazon, Target, Apple, Nike, Jiffy, HelloFresh, UPS, FedEx, and USPS. Standardizing this into a single authoritative shared resolver module (`supabase/functions/_shared/canonical-order-resolver.mjs` and `src/utils/vendorTransactions.ts`) will guarantee unified thread keys and cross-engine consistency.
4. **Premise (R4 - Active-Learning Engine)**: The existing `household_capture_rules` schema and prompt injection mechanism provide the foundation for active learning. To fulfill R4:
   - The **Compound Decomposer** is established in `scan-gmail-inbox` and `actionInspectionSynthesis.ts` and can be expanded for full 6-archetype coverage.
   - The **Dynamic Few-Shot Exemplar Store** needs to be created as a dedicated module/table that indexes high-quality exemplar pairs and retrieves the most relevant examples at inference time.
   - The **Active Feedback Loop** must connect UI dismissals, completions, title/date corrections, and voice directives (`capture-command`) directly into `household_capture_rules` with automatic prompt adaptation.
5. **Premise (R5 - Kiosk & Omnichannel Guarantees)**: The kiosk views (`CalmKioskView.tsx`, `TurboCanvasView.tsx`, `LivingCanvasHome.tsx`, `ActionHubPage.tsx`) use `needsYouFeed.ts` and `splitActionableAndTransitItems()` with strict 3-click navigation and zero noise leakage. Automated evaluation in `tests/` can test against the benchmark dataset while maintaining 100% pass rate on all 1,698 existing tests.

---

## 3. Caveats

- **Network Scope / API Rate Limits**: When pulling 1,000+ historical emails via Gmail API, quota batching (e.g. `maxResults=500` with page tokens) and token rate limits must be respected.
- **PII Scrubbing**: Historical emails contain real names, phone numbers, addresses, and account details. The redaction logic in `_shared/family-email-evidence.mjs` (`redactFamilyEvidenceText`) must be applied before exporting any holdout benchmark into repository test fixtures.
- **LLM Token Costs**: Processing full bodies of 1,000+ emails through multimodal LLMs will consume significant tokens; truncation of boilerplate HTML, header-only pre-filtering for obvious promotional digests, and using `gemini-2.5-flash-lite` for classification will keep inference fast and cost-effective.

---

## 4. Conclusion & Recommended Component Architecture

### Architecture Map & Feature Assignments

| Component / Requirement | Relevant Existing Files | Proposed Deliverable / Extensions |
| :--- | :--- | :--- |
| **R1. Historical Harvester & Semantic Clusterer** | `supabase/functions/scan-gmail-inbox/index.ts`<br>`supabase/functions/_shared/gmail-canonical-email.mjs`<br>`supabase/functions/_shared/family-email-evidence.mjs` | Build `scripts/harvest-historical-email-corpus.mjs` & Harvester pipeline that pulls 1,000+ emails across connected family accounts, anonymizes PII, and clusters into the 6 household archetypes. |
| **R2. Empirical Pattern Report & Benchmark** | `tests/`<br>`docs/` | Generate comprehensive empirical report documenting patterns and edge cases; check in 200+ curated test cases to `tests/fixtures/email-benchmark.json`. |
| **R3. Deterministic Entity & Canonical Order Resolver** | `src/utils/vendorTransactions.ts`<br>`supabase/functions/scan-gmail-inbox/index.ts`<br>`tests/vendor-transaction-producer.test.mjs` | Standardize multi-vendor normalization (Walmart hyphenated/unhyphenated, Amazon 17-digit, Apple W-order, Nike C0-order, Jiffy, HelloFresh, UPS, FedEx, USPS) into unified canonical entity resolver module. |
| **R4. Active-Learning Ingestion Engine** | `supabase/migrations/20260816020000_household_capture_rules.sql`<br>`supabase/functions/_shared/capture-command-router.mjs`<br>`src/utils/actionInspectionSynthesis.ts`<br>`src/hooks/usePrepItems.ts` | 1) Compound newsletter/flyer decomposer.<br>2) Dynamic Few-Shot Exemplar Store module.<br>3) Feedback Loop auto-learning from dismissals, corrections, and voice directives into `household_capture_rules`. |
| **R5. Verification Harness & Kiosk Integration** | `src/utils/needsYouFeed.ts`<br>`src/components/canvas/CalmKioskView.tsx`<br>`tests/` | Automated test runner evaluating the holdout benchmark dataset ($\ge 98\%$ accuracy, $0\%$ action queue leakage) and certifying all existing 1,698 tests pass. |

---

## 5. Verification Method

To independently verify the current findings and system baselines:

1. **Verify Existing Tests**:
   ```bash
   npm test
   ```
   *Expected output*: 1,698 passing tests across 115 test files with 0 failures.

2. **Inspect Core Ingestion & Extraction Logic**:
   - View `supabase/functions/scan-gmail-inbox/index.ts` lines 1–670 (Gmail API sync, history cursor, canonical deduplication, AI classification, action extraction, and vendor identity).
   - View `src/utils/vendorTransactions.ts` lines 1–320 (Vendor order canonicalization, tense-aware lifecycle stage resolution, and delivery consolidation).
   - View `supabase/migrations/20260816020000_household_capture_rules.sql` lines 1–45 (`household_capture_rules` schema).
   - View `src/utils/actionInspectionSynthesis.ts` lines 1–450 (Decomposition of newsletters/flyers into discrete action bundles).

3. **Verify Vendor Transaction & Active Learning Tests**:
   ```bash
   node --test tests/vendor-transaction-producer.test.mjs
   node --test tests/gmail-canonical-email.test.mjs
   node --test tests/gmail-attachment-action-bundle.test.mjs
   node --test tests/attention-topic-learning.test.mjs
   ```
