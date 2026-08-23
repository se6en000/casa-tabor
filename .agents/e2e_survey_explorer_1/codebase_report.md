# Autonomous Household Email Intelligence System: Codebase Survey & E2E Testing Architecture Report

**Explorer**: Codebase Explorer 1  
**Project Root**: `/Users/taboj/casa-tabor`  
**Timestamp**: 2026-08-23T11:48:10Z  
**Environment**: Node.js `v24.13.0`, ESM (`"type": "module"`), Node Native Test Runner (`node:test` + `node:assert/strict`)

---

## Executive Summary

Casa Tabor's Autonomous Household Email Intelligence System operates as a four-tier pipeline that ingests, dedupes, classifies, suggests, persists, and synthesizes household communications (school notices, pediatric/medical appointments, vendor orders & deliveries, utilities & bills, travel itineraries, and parent letters with PDF attachments).

The testing infrastructure runs natively with `node --test tests/*.test.mjs` without requiring bundling steps or external test runners (Node 24 natively loads `.mjs` and TypeScript `.ts` modules). An opaque-box E2E test in `tests/e2e-email-intelligence-tiers.test.mjs` can seamlessly invoke and validate the four email intelligence tiers using exported pure functional pipeline runners, domain utilities, schema contracts, and mockable entry points.

---

## 1. Project Configuration & Test Runner Setup

### 1.1 `package.json` & ES Module Configuration
- **Module System**: `"type": "module"` in `package.json`. Node interprets all `.js` and `.mjs` files as ES modules.
- **Node Runtime**: `v24.13.0` with built-in TypeScript stripping/execution support, enabling direct imports of `../src/utils/*.ts` inside test files without a separate compilation step.
- **Test Script**:
  ```json
  "test": "node --test tests/*.test.mjs"
  ```
- **Test Framework**: Built-in `node:test` and `node:assert/strict`.
- **Dependencies**:
  - Production: `@supabase/supabase-js` (2.106.2), `@tanstack/react-query` (5.100.14), `date-fns` (4.3.0), `date-fns-tz` (3.2.0), `framer-motion` (12.40.0), `lucide-react` (1.16.0), `pdfjs-dist` (5.7.284), `react` (19.2.6), `rrule` (2.8.1), `tailwind-merge` (3.6.0), `zustand` (5.0.13).
  - Dev: `@playwright/test` (1.61.1), `typescript` (~6.0.2), `vite` (8.0.12), `eslint` (10.3.0).

---

## 2. Email Intelligence Modules, Schemas, & Types

### 2.1 Backend / Edge Function Modules (`supabase/functions/`)

| Path | Purpose & Key Exports / Contracts |
|---|---|
| `supabase/functions/scan-gmail-inbox/index.ts` | Main email ingest & extraction engine (1,716 lines). Defines `CALENDAR_KEYWORDS`, `ACTION_KEYWORDS`, `TRAVEL_KEYWORDS`, `HouseholdCaptureRule`, `classifyEmail`, `extractInboxActions`, `fetchGmailAttachment`, `extractAttachmentDirectives`, `persistInboxActions`, `persistEventSuggestions`, `persistEmailKnowledgeClaims`, and `persistFamilyEmailEvidence`. |
| `supabase/functions/scan-travel-emails/index.ts` | Travel parsing pipeline for flights, lodging, and car rentals. Extracts itinerary legs, calculates packing lists, and populates `trips` & `trip_legs`. |
| `supabase/functions/_shared/gmail-canonical-email.mjs` | Multi-inbox deduplication engine. Exports `canonicalEmailKey`, `normalizeInternetMessageId`, and `canonicalContentFingerprint`. |
| `supabase/functions/_shared/gmail-message-content.mjs` | Raw Gmail payload MIME parser. Exports `extractGmailMessageContent` (multipart bodies, plain-text preferences, attachments metadata, quoted reply stripping). |
| `supabase/functions/_shared/family-email-evidence.mjs` | Informational school & family guidance processor. Exports `classifyFamilyEvidenceCandidate`, `redactFamilyEvidenceText` (redacts Student IDs, PINs, cards), and `chunkFamilyEvidenceText`. |
| `supabase/functions/_shared/assistant-email-knowledge-read.mjs` | RAG evidence formatter for conversational AI. Exports `formatFamilyKnowledgeContext`. |
| `supabase/functions/_shared/immediate-family-scope.mjs` | Scope isolation for family inboxes. Exports `filterImmediateFamilyMembers`, `isSharedFamilyInbox`, and `resolveImmediateFamilyMember`. |

### 2.2 Frontend Synthesis & Domain Utilities (`src/utils/`)

| Path | Purpose & Key Exports |
|---|---|
| `src/utils/actionInspectionSynthesis.ts` | Client-side inspection and plan decomposition. Exports `detectSuggestedEvent`, `detectSuggestedActionBundle`, `synthesizeActionAnalysis`, `extractSmartActionTitle`, `extractAmount`, and `parseDateSafe`. |
| `src/utils/vendorTransactions.ts` | Order lifecycle and delivery timeline clustering. Exports `buildDeliveryTransitItem`, `consolidateTransitItems`, `isDeliveryTransitItem`, `orderId`, `canonicalizeOrderId`, `inferDeliveryStage`, and `isPerishableVendor`. |
| `src/utils/needsYouFeed.ts` | Action feed arbitration. Exports `splitActionableAndTransitItems`, `mergeNeedsYouItems`, `conflictToNeedsYouItem`, and `directorySuggestionToNeedsYouItem`. |
| `src/utils/prepCategories.ts` | Enforced 9-category taxonomy definitions, labels, colors, and filter constants (`PREP_CATEGORIES`, `PREP_FILTERS`, `PREP_SOURCE_FILTERS`). |
| `src/utils/gmailHealth.ts` | Health assessment. Exports `summarizeGmailHealth`. |

### 2.3 Database Schemas & Migrations (`supabase/migrations/`)

| Migration File | Schema & Table Definitions |
|---|---|
| `20260807180000_canonical_inbox_email_knowledge.sql` | `canonical_inbox_emails` (deduped across multi-account inboxes), `family_knowledge_claims` (status, requiredness, privacy_class, title, summary, canonical_email_id). |
| `20260816020000_household_capture_rules.sql` | `household_capture_rules` (pattern_type, pattern_value, rule_directive, origin, confidence, active). |
| `20260809201500_vendor_transaction_threads.sql` | `prep_items.attention_thread_key`, `attention_vendor`, `attention_stage`. |
| `20260822080000_gmail_attachments_and_document_summaries.sql` | `prep_items.source_origin` (`email_body`, `attachment`, `compound`), `gmail_processed_messages.attachments`, `extracted_document_summary`. |
| `20260805150000_prep_category_taxonomy_and_overdue_safety_valve.sql` | Enforced 9-category check constraint on `prep_items.category`. |

### 2.4 TypeScript Types (`src/types/index.ts`)
- `PrepItem`: Represents actionable prep items, suggestions, and logistics tasks.
- `PrepItemCategory`: Union of 9 categories (`gift_occasion`, `food_hosting`, `forms_paperwork`, `bills_payments`, `travel_trips`, `medical_health`, `household_errands`, `rsvp_response`, `general_todo`).
- `DeliveryTransitItem` & `DeliveryTransitStage`: Stages: `confirmed`, `payment`, `shipped`, `out_for_delivery`, `delivered`, `problem`.
- `SuggestedEventPlan`: Suggested calendar appointments for 1-tap addition.
- `SuggestedActionBundle`: Decomposed bundles combining multiple actions across emails and attachments.
- `ActionAnalysis`: Executive brief, required actions, documents, and document preview key points.

---

## 3. Existing Test Patterns & Execution Findings

- **Test Suite Volume**: 271 existing test suites under `tests/*.test.mjs`.
- **Execution Speed**: 39 Gmail-specific tests execute in ~644ms.
- **Testing Style**:
  1. Direct unit & functional pipeline verification using `node:test` and `node:assert/strict`.
  2. Source code contract assertions (verifying regexes, AST structures, policy guardrails, and DB migrations).
  3. Dynamic input/output evaluation across complex fixtures without external mocking frameworks.

---

## 4. Opaque-Box E2E Test Blueprint: `tests/e2e-email-intelligence-tiers.test.mjs`

An opaque-box E2E test validates the system by feeding raw email payloads through each tier and asserting deterministic outputs at every boundary.

### Tier 1: Canonical Inbox Deduplication & MIME Body Parsing
- **Inputs**: Raw Google Gmail API message payloads (multipart MIME, HTML with tracking pixels, plain-text alternates, attachments).
- **Invocations**:
  - `extractGmailMessageContent(payload)`
  - `canonicalEmailKey({ messageId, from, subject, receivedAt, normalizedBody })`
  - `canonicalContentFingerprint(body)`
  - `normalizeInternetMessageId(rawId)`
- **Verifications**:
  - Validates RFC Message-ID extraction (`rfc:<id>`).
  - Validates deterministic SHA-256 fallback when Message-ID is omitted (`fallback:<hash>`).
  - Validates that two copies of the same email sent to different family members resolve to the identical `canonical_key`.
  - Verifies plain-text preference over HTML and extraction of attachment metadata.

### Tier 2: Keyword Gating, Intent Classification, Multimodal Directives, & Family Evidence
- **Inputs**: Diverse real-world household email fixtures:
  1. *School Notice*: "Bak MSOA Curriculum Night & Campus Information" with attached PDF schedule.
  2. *Pediatric Appointment*: "Dr. Hanna Pediatric Checkup confirmation at Palm Beach Pediatrics".
  3. *Vendor Transactions*: Multi-stage Walmart InHome grocery delivery emails (pricing hold, order summary, out for delivery).
  4. *Utility / Bill*: "FPL Billing Statement - Payment Due $266.08".
  5. *Informational Evidence*: School guidance with sensitive data (Student ID, PIN, account numbers).
  6. *Travel Itinerary*: Delta flight confirmation with flight legs, confirmation code, and dates.
- **Invocations**:
  - `classifyFamilyEvidenceCandidate({ subject, body, from })`
  - `redactFamilyEvidenceText(text)`
  - `chunkFamilyEvidenceText(text, options)`
  - Source inspection / contract tests on `CALENDAR_KEYWORDS`, `ACTION_KEYWORDS`, `TRAVEL_KEYWORDS`.
- **Verifications**:
  - Sensitive credentials (PIN, Student ID, Card numbers) are redacted to `[REDACTED]`.
  - Informational school guidance is classified as eligible family evidence.
  - Multi-part chunks maintain bounded lengths and overlap continuity.

### Tier 3: Suggestion & State Persistence Pipeline
- **Contracts Tested**:
  - `persistEventSuggestions`: Asserts that extracted calendar events from Gmail are tagged with `source_pattern_key: 'event_suggestion'` and `type: 'appointment'`, and NEVER directly inserted into the `events` table or dispatched to Google Calendar.
  - `persistInboxActions`: Asserts `prep_items` mapping for `attention_thread_key`, `attention_vendor`, `attention_stage`, `category`, and `source_origin` (`email_body`, `attachment`, `compound`).
  - `persistEmailKnowledgeClaims`: Asserts creation of source-backed records in `family_knowledge_claims` linked to `canonical_email_id`.
  - `persistFamilyEmailEvidence`: Asserts insertion into `family_data_documents` and queuing in `family_data_index_queue`.

### Tier 4: Client-Side Synthesis, Logistics Radar, & Sidecar Inspection
- **Inputs**: Persisted `PrepItem` records and detailed context objects.
- **Invocations**:
  - `detectSuggestedEvent(prepItem)`
  - `detectSuggestedActionBundle(primaryItem, detailedItem, siblingItems)`
  - `synthesizeActionAnalysis(activeItem, detailedItem, siblingItems)`
  - `buildDeliveryTransitItem(prepItem)`
  - `consolidateTransitItems(transitItems)`
  - `splitActionableAndTransitItems(prepItems)`
  - `formatFamilyKnowledgeContext(claims)`
- **Verifications**:
  - `detectSuggestedEvent` yields complete `SuggestedEventPlan` (title, date, displayDate, location, confidence).
  - `detectSuggestedActionBundle` decomposes compound letters into discrete events, prep tasks, waivers, and quick links.
  - `synthesizeActionAnalysis` produces structured `ActionAnalysis` with executive brief, urgency, required actions, documents, and document preview key points.
  - `buildDeliveryTransitItem` clusters Walmart/Amazon updates under a unified thread key (e.g. `delivery:walmart:2026-08-19`) with correct stages and perishable flags.
  - `splitActionableAndTransitItems` separates actionable tasks from passive logistics.
  - `formatFamilyKnowledgeContext` produces formatted markdown RAG context preserving sender attribution.

---

## 5. Recommended Test Structure for `tests/e2e-email-intelligence-tiers.test.mjs`

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canonicalEmailKey, normalizeInternetMessageId, canonicalContentFingerprint } from '../supabase/functions/_shared/gmail-canonical-email.mjs'
import { extractGmailMessageContent } from '../supabase/functions/_shared/gmail-message-content.mjs'
import { classifyFamilyEvidenceCandidate, redactFamilyEvidenceText, chunkFamilyEvidenceText } from '../supabase/functions/_shared/family-email-evidence.mjs'
import { formatFamilyKnowledgeContext } from '../supabase/functions/_shared/assistant-email-knowledge-read.mjs'
import { detectSuggestedEvent, detectSuggestedActionBundle, synthesizeActionAnalysis, extractSmartActionTitle, extractAmount, parseDateSafe } from '../src/utils/actionInspectionSynthesis.ts'
import { buildDeliveryTransitItem, consolidateTransitItems, isDeliveryTransitItem, canonicalizeOrderId } from '../src/utils/vendorTransactions.ts'
import { splitActionableAndTransitItems, mergeNeedsYouItems } from '../src/utils/needsYouFeed.ts'

test('Tier 1: Canonical Inbox Deduplication & MIME Parsing', async (t) => {
  // Test raw mime decoding, attachment parsing, RFC Message-ID and fallback deduping
})

test('Tier 2: Gating, Multimodal Directives, & Evidence Extraction', async (t) => {
  // Test keyword matching, family evidence candidate classification, redaction, chunking
})

test('Tier 3: Suggestion & State Persistence Pipeline Contracts', async (t) => {
  // Verify non-destructive event suggestion routing, knowledge claim creation, prep item taxonomy
})

test('Tier 4: Synthesis, Logistics Radar, & Sidecar Inspection', async (t) => {
  // Verify 1-tap SuggestedEventPlan, compound action bundles, document preview keypoints, delivery consolidation, RAG formatting
})
```

---

## Conclusion
The project has a mature, robust, and highly modular architecture for autonomous email intelligence. An opaque-box E2E test in `tests/e2e-email-intelligence-tiers.test.mjs` can be executed directly using `node --test tests/e2e-email-intelligence-tiers.test.mjs` and will provide end-to-end coverage across all four tiers of email intelligence.
