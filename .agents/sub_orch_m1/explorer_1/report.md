# Milestone 1: Historical Corpus Harvester & Semantic Clusterer — Architectural Investigation Report

**Author**: Explorer 1 (Milestone 1)  
**Date**: 2026-08-23  
**Working Directory**: `/Users/taboj/casa-tabor/.agents/sub_orch_m1/explorer_1/`  
**Target Project**: Casa Tabor Autonomous Household Email Intelligence System (`/Users/taboj/casa-tabor`)

---

## Executive Summary

This investigation analyzed the entire Casa Tabor codebase, Supabase database schemas, Google OAuth authentication flow, email processing pipeline, module systems, and testing infrastructure to establish the exact architecture for **Milestone 1 (Historical Corpus Harvester & Semantic Clusterer)**.

Key findings:
1. **Live Production Data Available**: Supabase contains **2,247 canonical inbox emails** and **2,348 processed Gmail messages** (with **1,838 retaining full raw email bodies**) across 2 connected family Google accounts (`jacobrtabor@gmail.com` and `taborfamilyemail@gmail.com`).
2. **Dual Execution Runtime**: 
   - Root package is **native ESM (`"type": "module"`)** running on **Node.js v24.13.0**, which natively executes `.mjs` scripts and `.ts` files with type-stripping.
   - Supabase Edge Functions run on **Deno**.
   - Shared utility files placed in `supabase/functions/_shared/*.mjs` or `src/utils/*.ts` are seamlessly imported by both Node scripts/tests and Deno edge functions.
3. **Test Infrastructure**: Standard `node --test tests/*.test.mjs` test runner using `node:test` and `node:assert/strict`. All **1,698 existing unit and integration tests** currently pass in **<6 seconds**. `tests/email-harvester-clusterer.test.mjs` will directly integrate into this suite with zero extra dependencies.
4. **Clean Design for M1 Deliverables**:
   - `scripts/harvest-historical-email-corpus.mjs`: Standalone CLI harvester supporting 3 modes (Supabase DB, live Gmail API via OAuth refresh tokens, and synthetic generation for 1,000+ emails), with RFC message-id deduplication and comprehensive PII redaction.
   - `lib/email-clustering.ts` / `supabase/functions/_shared/email-clusterer.mjs`: Multi-stage semantic classifier partitioning emails into the 6 household archetypes with confidence scores, subcategories, agency levels (`0` vs `>=1`), and entity extraction.
   - `tests/email-harvester-clusterer.test.mjs`: Robust test suite verifying 1,000+ email harvesting, PII redaction, 6-archetype clustering accuracy, and boundary edge cases.

---

## 1. Codebase Architecture & Module System

### 1.1 Package & Runtime Configuration
- **Package Configuration** (`package.json`):
  - `"type": "module"`: ESM top-level module system.
  - `"scripts"`:
    - `"test": "node --test tests/*.test.mjs"` (Node native test runner).
    - `"build": "npm run tokens:check && npm run style:check && npm run certify:experience && tsc -b && vite build"`.
    - `"supabase:check": "node scripts/verify-supabase.mjs"`.
    - `"supabase:query": "node scripts/supabase-query.mjs"`.
  - **Node.js Version**: `v24.13.0`.
  - **Dependencies**: `@supabase/supabase-js` (2.106.2), `date-fns` (4.3.0), `date-fns-tz` (3.2.0), `framer-motion` (12.40.0), `lucide-react` (1.16.0), `pdfjs-dist` (5.7.284), `react` (19.2.6), `react-dom` (19.2.6), `react-router-dom` (7.15.1), `rrule` (2.8.1), `tailwind-merge` (3.6.0), `zustand` (5.0.13).
  - **DevDependencies**: `@playwright/test` (1.61.1), `@tailwindcss/vite` (4.3.0), `typescript` (~6.0.2), `vite` (8.0.12).
  - **No Vitest / Jest**: The project exclusively uses `node:test` and `node:assert/strict` for unit and integration testing.

### 1.2 Multi-Runtime Compatibility Pattern
The repository uses a dual-runtime structure:
- **Node.js**: Executes CLI scripts in `scripts/*.mjs` and test suites in `tests/*.test.mjs`.
- **Deno**: Executes Supabase Edge Functions in `supabase/functions/*/index.ts`.
- **Shared Code Pattern**:
  - Pure JS/ESM modules in `supabase/functions/_shared/*.mjs` avoid runtime-specific APIs (using Web Standards: `fetch`, `crypto.subtle`, `TextEncoder`, `atob`, `URLSearchParams`).
  - These `.mjs` modules can be imported directly by Deno edge functions (`import ... from '../_shared/...'`), Node CLI scripts (`import ... from '../supabase/functions/_shared/...'`), and Node test suites (`import ... from '../supabase/functions/_shared/...'`).
  - Frontend TypeScript modules in `src/utils/*.ts` and `src/lib/*.ts` are also importable directly by Node 24 test files.

---

## 2. Gmail Connection & Existing Data Inventory

### 2.1 Token & Credential Storage
- **Database Table** `public.google_tokens`:
  - Columns: `family_member_id` (UUID PK), `google_email` (text), `refresh_token` (text), `access_token` (text), `expires_at` (timestamptz), `scope` (text), `sync_token` (text), `last_sync_at` (timestamptz), `gmail_scan_enabled` (boolean), `gmail_history_id` (text), `gmail_last_scan_attempt_at` (timestamptz), `gmail_last_scan_success_at` (timestamptz), `gmail_last_scan_error` (text).
  - RLS enabled: Accessible only via Supabase `service_role` key (or view `google_connection_status` for safe metadata).
- **Environment Credentials** (`.env.local`):
  - `VITE_SUPABASE_URL`: Supabase project URL.
  - `SUPABASE_SERVICE_ROLE_KEY`: Service role key for admin database access and token retrieval.
  - `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`: OAuth credentials for token refresh.
  - `GOOGLE_REDIRECT_URI`: OAuth callback endpoint.
- **Active Connected Accounts**:
  - `jacobrtabor@gmail.com` (Jacob Tabor, Parent, `gmail_scan_enabled: true`)
  - `taborfamilyemail@gmail.com` (Tabor Family shared mailbox, `gmail_scan_enabled: true`)

### 2.2 Existing Historical Email Storage
- **`public.canonical_inbox_emails`** (2,247 records):
  - Columns: `id`, `canonical_key` (e.g. `rfc:<id>` or `fallback:<sha256>`), `gmail_thread_id`, `internet_message_id`, `from_email`, `subject`, `received_at`, `content_fingerprint`, `content_format` (`plain`/`html`/`none`), `attachment_count`, `first_seen_at`, `last_seen_at`.
  - Serves as cross-inbox deduplication index across multiple connected family accounts.
- **`public.gmail_processed_messages`** (2,348 records, 1,838 with full raw `email_body`):
  - Columns: `id`, `family_member_id`, `gmail_message_id`, `canonical_email_id`, `subject`, `from_email`, `received_at`, `intent`, `skipped_reason`, `created_event_id`, `updated_event_id`, `email_body` (up to 8,000 chars), `email_subject`, `attachments` (JSONB), `extracted_document_summary` (text), `is_user_labeled` (boolean), `training_source` (text).
- **`public.household_capture_rules`** (8 active learned rules):
  - Stores domain/sender/subject directives learned from user feedback and label actions.

---

## 3. Existing Email Ingestion & Extraction Modules

The following existing modules provide crucial building blocks and reference logic:

1. **`supabase/functions/_shared/gmail-canonical-email.mjs`**:
   - `canonicalEmailKey({ messageId, from, subject, receivedAt, normalizedBody })`: Generates `rfc:<internetMessageId>` or 10-minute bucketed fallback hash `fallback:<sha256>`.
   - `canonicalContentFingerprint(value)`: Generates SHA-256 fingerprint of normalized text.
   - `normalizeInternetMessageId(value)`: Trims and strips angle brackets.

2. **`supabase/functions/_shared/gmail-message-content.mjs`**:
   - `extractGmailMessageContent(payload)`: Recursively walks Gmail MIME tree, extracts `text/plain` and `text/html`, decodes base64url, strips HTML tags/entities, and parses attachments.
   - `stripQuotedReplyHistory(value)`: Strips email reply headers (`On ... wrote:`, `From: ... Sent: ...`).

3. **`supabase/functions/_shared/family-email-evidence.mjs`**:
   - `classifyFamilyEvidenceCandidate(input)`: Keyword and category pattern matcher.
   - `redactFamilyEvidenceText(value)`: Redacts Student IDs, PINs, passwords, SSNs (`\d{3}-\d{2}-\d{4}`), and 13-19 digit credit card numbers.
   - `chunkFamilyEvidenceText(value, options)`: Splits text into bounded chunks with overlap.

4. **`src/utils/vendorTransactions.ts`**:
   - Multi-vendor order number canonicalizer:
     - Amazon: `3-7-7` format (`\d{3}-\d{7}-\d{7}`).
     - Walmart: `7-8` hyphenated (`(?:2000|1000)\d{3}-\d{8}`) or normalized 15/16 digit numbers.
     - Apple: `W` prefix (`W\d{9,10}`).
     - Nike: `C0` prefix (`C0\d{9,11}`).
     - HelloFresh / Meal Kits: `HF-\d{6,10}`, `GC-\d{6,10}`.
     - Courier tracking: UPS (`1Z[0-9A-Z]{16}`), USPS (`9[2345]\d{20,24}`), FedEx (`\d{12,22}`).
   - Stage progression: `confirmed` -> `payment` -> `shipped` -> `out_for_delivery` -> `delivered` / `problem`.
   - Future arrival date guardrails: Items scheduled for future days are never prematurely auto-resolved as `delivered`.
   - Policy disclaimer detection: Return windows and damage claim clauses are recognized so shipping notifications are not misclassified.

5. **`src/utils/needsYouFeed.ts`**:
   - `splitActionableAndTransitItems(items)`: Partitions tasks into `actionableItems` (agency level >= 1) and `deliveryTransitItems` (agency level 0).

---

## 4. The 6 Semantic Archetypes & Classification Contracts

For Milestone 1, all harvested and synthetic emails must be clustered into the 6 core household semantic archetypes:

| # | Archetype Identifier | Description & Examples | Agency Level | Expected Routing | Subcategories |
|---|---|---|---|---|---|
| 1 | `logistics_parcels` | E-commerce orders, grocery deliveries (Walmart InHome, Instacart), couriers (UPS, FedEx, USPS, DHL), meal kits (HelloFresh). | `0` (Passive) | `logistics_radar` / Inbound Manifest | `order_confirmation`, `shipping_update`, `out_for_delivery`, `delivery_completed`, `grocery_inhome`, `meal_kit` |
| 2 | `executive_actions` | Action items requiring human agency: permission slips, waivers, tuition/fee invoices (SchoolCash), registrations, paperwork, overdue bills. | `1` or `2` (Action) | `action_queue` / Needs You Feed | `permission_slip`, `waiver_consent`, `invoice_payment`, `registration_deadline`, `form_signature`, `document_submission` |
| 3 | `temporal_appointments` | Scheduled calendar commitments: doctor/dentist visits, pediatric therapy, school meetings, sports games/practices, travel itineraries, lessons. | `1` (Calendar) | `stage_calendar` / Event Suggestions | `doctor_medical`, `pediatric_dentist`, `school_meeting`, `sports_practice_game`, `travel_itinerary`, `music_lesson` |
| 4 | `lifecycle_updates` | Real-time state shifts for active commitments: flight delays, gate changes, order edits/item substitutions, rescheduled appointments, weather cancellations. | `0` or `1` (Update) | `stage_calendar` / `logistics_radar` | `flight_schedule_change`, `order_modification`, `delivery_delay`, `appointment_reschedule`, `weather_cancellation` |
| 5 | `estate_knowledge` | Informational estate and school context: newsletters (PTO/school digest), HOA announcements, home maintenance advice, utility notices, gate codes. | `0` (Knowledge) | `passive_briefing` / Family Evidence Index | `school_newsletter`, `hoa_announcement`, `home_maintenance`, `utility_service_notice`, `community_knowledge` |
| 6 | `promotional_noise` | Marketing campaigns, retail sales, discount coupons, automated promotional digests, donation requests, marketing newsletters. | `0` (Noise) | `ignore` / Filtered Out | `retail_sale`, `promotional_coupon`, `marketing_digest`, `fundraiser_donation`, `social_newsletter` |

---

## 5. PII Redaction & Anonymization Requirements

The PII anonymizer in Milestone 1 must sanitize real email text before clustering or external dataset persistence:

1. **Family Names & Aliases**:
   - `Jacob Tabor`, `Jake Tabor`, `Kelly Tabor`, `Kelly Loucks`, `Olivia Tabor`, `Liv Tabor`, `Emerson Tabor`, `Emme Tabor`, `Owen Tabor`, `Milo Tabor`, `Giselle`.
   - Redacted to: `[PARENT_NAME]`, `[CHILD_NAME]`, `[CAREGIVER_NAME]`, or `[FAMILY_MEMBER]`.
2. **Personal Email Addresses**:
   - `jacobrtabor@gmail.com`, `kellyroseloucks@gmail.com`, `taborfamilyemail@gmail.com`, etc.
   - Redacted to: `[PERSONAL_EMAIL]`.
   - Note: Merchant and organization domains (e.g. `help@walmart.com`, `notifications@aa.com`, `school@palmbeachschools.org`) are preserved or normalized to `[SENDER_DOMAIN]`.
3. **Physical Addresses & Locations**:
   - Full street addresses, apartment numbers, personal street lines.
   - Redacted to: `[STREET_ADDRESS]`, `[CITY_STATE_ZIP]`.
4. **Phone Numbers**:
   - 10-digit / 11-digit phone numbers, formatted `(561) 379-6111`, `561-379-6111`, `16175965937`.
   - Redacted to: `[PHONE]`.
5. **Financial & Identity Numbers**:
   - Credit card / debit card numbers (`\b(?:\d[ -]*?){13,19}\b`, `ending in \d{4}`) -> `[CREDIT_CARD]`, `[CARD_LAST4]`.
   - Social Security Numbers (`\b\d{3}-\d{2}-\d{4}\b`) -> `[SSN]`.
   - Student IDs (`student id: \d+`) -> `[STUDENT_ID]`.
   - PINs / Passcodes (`PIN: \d{4}`) -> `[PIN]`.
   - Bank accounts / routing numbers -> `[ACCOUNT_NUMBER]`.

---

## 6. Milestone 1 Architecture & File Implementation Plan

### 6.1 `scripts/harvest-historical-email-corpus.mjs`
- **Location**: `/Users/taboj/casa-tabor/scripts/harvest-historical-email-corpus.mjs`
- **Responsibilities**:
  1. **Source Connectors**:
     - Mode `supabase` (default): Queries `canonical_inbox_emails` and `gmail_processed_messages` with pagination and batching.
     - Mode `gmail`: Uses OAuth refresh tokens from `google_tokens` to query live Gmail API across Primary, Updates, and Promotions labels.
     - Mode `synthetic`: Generates 1,000+ realistic synthetic family emails across all 6 archetypes.
  2. **Deduplication Engine**: Uses `canonicalEmailKey` to guarantee 0 cross-inbox duplicate entries.
  3. **PII Redaction Pipeline**: Runs the comprehensive PII redaction engine over subject, sender, snippet, body text, and extracted metadata.
  4. **Output Generation**: Writes structured anonymized corpus to `data/historical-email-corpus.json` (or CLI specified `--out` path).
  5. **CLI Options**: `--source=[supabase|gmail|synthetic]`, `--limit=1000`, `--out=<path>`, `--anonymize`, `--cluster`, `--stats`.

### 6.2 `lib/email-clustering.ts` & `supabase/functions/_shared/email-clusterer.mjs`
- **Location**: 
  - Dual implementation: `src/lib/email-clustering.ts` (TypeScript for frontend/client use) and `supabase/functions/_shared/email-clusterer.mjs` (ESM module for edge functions, Node scripts, and test suite).
- **Responsibilities**:
  1. **Feature Extraction**:
     - Extracts sender domain, subject tokens, body tokens, urgency indicators, financial amounts, temporal anchors, reference numbers, and MIME/attachment presence.
  2. **Deterministic & Semantic Rule Engine**:
     - Rule hierarchy: High-confidence vendor/order tracking -> `logistics_parcels`; High-confidence permission slips/invoices/waivers -> `executive_actions`; Doctor/school appointments -> `temporal_appointments`; Flight delays/reschedules -> `lifecycle_updates`; Newsletters/HOA -> `estate_knowledge`; Promotions/marketing -> `promotional_noise`.
     - Edge case filters:
       - Strips return/claim policy disclaimers from triggering `executive_actions`.
       - Recognizes marketing urgency fake-outs (e.g. "Action required: 30% off") as `promotional_noise`.
       - Differentiates future arrival dates from past/present deliveries.
  3. **Confidence & Subcategory Assignment**:
     - Computes confidence score `[0.0, 1.0]` based on feature coverage and disambiguation margin.
     - Assigns fine-grained subcategory.
  4. **Entity Extraction**:
     - Extracts masked order IDs, tracking numbers, carriers, merchant names, dates, amounts.
  5. **PII Sanitizer**:
     - Standalone exported `redactPII(text)` function.

### 6.3 `tests/email-harvester-clusterer.test.mjs`
- **Location**: `/Users/taboj/casa-tabor/tests/email-harvester-clusterer.test.mjs`
- **Responsibilities**:
  - Tests integrated into `npm test` (`node --test tests/*.test.mjs`).
  - Test suites:
    1. **PII Anonymization Suite**: Verifies redaction of family names, personal emails, phone numbers, street addresses, credit cards, student IDs, SSNs, and PINs.
    2. **Deduplication Suite**: Verifies RFC message-id and fallback fingerprint deduplication across dual-inbox deliveries.
    3. **1,000+ Corpus Generator / Harvester Suite**: Verifies batch generation/harvesting of 1,000+ emails across Primary, Updates, and Promotions.
    4. **Semantic Clustering Suite (All 6 Archetypes)**: Tests representative emails for all 6 archetypes achieving >= 98% accuracy.
    5. **Edge Case & Disambiguation Suite**:
       - Logistics email with claims/returns policy disclaimer -> `logistics_parcels` (agency level 0).
       - Promotional email with urgent call-to-action ("Action required: your coupon expires") -> `promotional_noise`.
       - Multi-event school newsletter -> `estate_knowledge`.
       - Rescheduled flight / appointment -> `lifecycle_updates`.
       - Malformed headers, empty bodies, unicode emojis, and multipart HTML.
    6. **Regression Certification**: Verifies all 1,698 existing tests continue to pass with 0 failures.

---

## 7. Recommended Implementation Sequence for Implementer

1. **Step 1: Create Shared Email Clusterer & PII Redactor** (`supabase/functions/_shared/email-clusterer.mjs` and `src/lib/email-clustering.ts`).
   - Implement `redactPII()`, `extractEmailFeatures()`, `classifyEmailArchetype()`, `clusterEmailCorpus()`.
2. **Step 2: Create Harvesting & Corpus Generation Script** (`scripts/harvest-historical-email-corpus.mjs`).
   - Implement Supabase DB reader, Live Gmail fetcher (with token refresh), Synthetic 1,000+ corpus generator, deduplicator, and CLI export.
3. **Step 3: Create Comprehensive Test Suite** (`tests/email-harvester-clusterer.test.mjs`).
   - Write comprehensive tests for PII redaction, deduplication, 1,000+ harvesting, 6-archetype clustering, and boundary edge cases.
4. **Step 4: Run Full Verification Suite**.
   - Execute `node --test tests/email-harvester-clusterer.test.mjs` and `npm test` (verifying 1,698+ tests pass).
   - Execute `node scripts/harvest-historical-email-corpus.mjs --source=synthetic --limit=1000 --cluster --stats`.

---

## 8. Summary Table: Deliverables & Path Mapping

| Deliverable | Path | Primary Purpose |
|---|---|---|
| **Harvester Script** | `scripts/harvest-historical-email-corpus.mjs` | Multi-source harvester (Supabase DB, live Gmail, synthetic) with PII redaction & deduplication. |
| **Shared Clusterer** | `supabase/functions/_shared/email-clusterer.mjs` | Pure ESM 6-archetype semantic clustering engine with feature extraction and PII redactor. |
| **Frontend Clusterer** | `src/lib/email-clustering.ts` | TypeScript interface and wrapper for client/frontend consumption. |
| **Test Suite** | `tests/email-harvester-clusterer.test.mjs` | Node native test suite validating PII redaction, deduplication, 1000+ corpus, and 6-archetype accuracy. |
| **Harvested Data Cache** | `data/historical-email-corpus.json` (or `data/`) | Anonymized harvested corpus dataset. |
