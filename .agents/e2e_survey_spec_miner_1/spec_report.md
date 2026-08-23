# Autonomous Household Email Intelligence System — Comprehensive Specification Report

**Document**: Specification & Feature Discovery Report  
**Target Milestone**: E2E Survey & Specification Mining  
**Author**: Spec Miner 1  
**Project Root**: `/Users/taboj/casa-tabor`  
**Working Directory**: `/Users/taboj/casa-tabor/.agents/e2e_survey_spec_miner_1`  
**Date**: 2026-08-23T11:47:00Z  

---

## Executive Summary

This specification report provides the exhaustive, authoritative technical blueprint for the **Autonomous Household Email Intelligence System** of Casa Tabor. Based on deep analysis of `ORIGINAL_REQUEST.md`, `PROJECT.md`, database migrations, edge functions (`supabase/functions/scan-gmail-inbox`, `scan-travel-emails`, `_shared/`), frontend models (`src/utils/vendorTransactions.ts`, `needsYouFeed.ts`, `actionInspectionSynthesis.ts`), and verification test suites (`tests/`), this document formalizes:

1. **The 6 Email Archetypes & Agency Levels** (Autonomous, Draft, Alert) and confidence thresholds.
2. **Deterministic Order Number & Tracking Normalization** across all major vendors and couriers.
3. **Compound Email Decomposition** (multi-item orders, multimodal PDF attachments, multi-event newsletters).
4. **Active Learning & Runtime Rule Overrides** (few-shot exemplars, user feedback synthesis, voice directives).
5. **Exact Type Schemas, Interfaces, and Extraction Contracts**.

---

## 1. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Ingestion / Harvesting | Multi-Mailbox Gmail Ingest & Cursoring | Ingests messages across linked family accounts via Gmail REST API using `historyId` incremental cursors or 72-hour window. | Gmail access tokens, `historyId`, optional `backfill_since`/`backfill_before` | List of raw Gmail message IDs | Falls back to full 72h inbox window on 404/expired `historyId` | `scan-gmail-inbox/index.ts:148-195` |
| 2 | Deduplication | Canonical Email RFC Hashing & Fingerprinting | Cross-mailbox message deduplication using RFC `Message-ID` or 10-minute bucket fallback hash (`canonicalEmailKey`, `canonicalContentFingerprint`). | `messageId`, `from`, `subject`, `receivedAt`, `normalizedBody` | Canonical key `rfc:<id>` or `fallback:<sha256>`, content SHA-256 | Generates fallback hash if RFC Message-ID header missing | `_shared/gmail-canonical-email.mjs:1-57` |
| 3 | Classification | 6-Archetype Intent Classification | Semantically classifies emails into the 6 household archetypes with strict date anchoring to email sent date. | Email subject, from, sent date, body (up to 3500 chars), family members list, matched rules | `EmailIntent` JSON (`intent`, `events[]`, `title`, `start_datetime`, `end_datetime`, `family_evidence`) | Returns `null` on JSON parsing or LLM failure; defaults intent to `'skip'` | `scan-gmail-inbox/index.ts:394-479` |
| 4 | Action Extraction | Granular Inbox Action Extraction | Extracts actionable family tasks (`forms`, `payment`, `rsvp`, `deadline`, `delivery`, `renewal`, `general`) with agency levels. | Subject, from, date, body, attachments list, extracted document summary | `InboxActionItem[]` with `type`, `description`, `due_datetime`, `priority`, `agency_level`, `vendor`, `transaction_id`, `transaction_status`, `policy_disclaimer` | Returns empty actions array `{"actions":[]}` | `scan-gmail-inbox/index.ts:481-562` |
| 5 | Multimodal Decomposer | Attached PDF / Flyer Directive Extraction | Multimodal extraction using `gemini-2.5-flash` on PDF and image attachments up to 5MB, summarizing schedules and waivers. | Base64 attachment data, mime type, filename | Textual `extracted_document_summary` containing key points, dates, rules | Skips failed attachment downloads, logs warning | `scan-gmail-inbox/index.ts:230-275` |
| 6 | Calendar Suggestion | Non-Destructive Event Suggestion Pipeline | Routes extracted appointment dates into `prep_items` suggestions (`source_pattern_key: 'event_suggestion'`), never auto-injecting into primary calendar. | `ExtractedEventItem[]`, sender, messageId | `prep_items` rows (`type: 'appointment'`, `attention_stage: 'suggested_event'`) | Skips duplicate events if fuzzy match against existing calendar events $\ge 0.85$ | `scan-gmail-inbox/index.ts:805-865` |
| 7 | Entity Resolution | Deterministic Order Canonicalizer (Walmart) | Normalizes 15/16-digit Walmart order numbers (with or without hyphens) into canonical 7-8 format (`2000154-80824348`). | Raw string e.g. `"200015480824348"`, `"Order # 2000154-80824348"` | Canonical string `"2000154-80824348"` | Normalizes alphanumeric characters, falls back to normalized clean string | `vendorTransactions.ts:42-51` |
| 8 | Entity Resolution | Deterministic Order Canonicalizer (Amazon) | Normalizes 17-digit Amazon order numbers into canonical 3-7-7 format (`112-8472910-4829103`). | Raw string e.g. `"11284729104829103"`, `"Order #112-8472910-4829103"` | Canonical string `"112-8472910-4829103"` | Normalizes alphanumeric characters, falls back to normalized clean string | `vendorTransactions.ts:52-58` |
| 9 | Entity Resolution | Deterministic Order Canonicalizer (Apple & Nike) | Standardizes Apple Web Order (`W` + 9-10 digits) and Nike (`C0` / `C-` + 9-11 digits) into uppercase canonical keys. | Raw string e.g. `"w123456789"`, `"c0123456789"` | `"W123456789"`, `"C0123456789"` | Case normalization to uppercase | `vendorTransactions.ts:59-64` |
| 10 | Entity Resolution | Multi-Carrier Courier Tracking Detection | Detects UPS (`1Z[0-9A-Z]{16}`), USPS (`9[2345]\d{20,24}`), FedEx (`\d{12,22}`), and DHL tracking numbers. | Email subject, description, source ref | Standardized tracking number and carrier ID | Ignores invalid length numbers | `vendorTransactions.ts:112-121` |
| 11 | State Machine | Tense-Aware Lifecycle Progression | Determines effective delivery stage (`confirmed`, `payment`, `shipped`, `out_for_delivery`, `delivered`, `problem`) with date guardrails. | Raw stage, delivery date, evaluation timestamp `now` | Effective `DeliveryTransitStage` | Future delivery notices stay `confirmed`/`shipped`, never premature `delivered` | `vendorTransactions.ts:574-610` |
| 12 | State Machine | In-Place Delivery Entity Merge | Deduplicates and merges multiple updates for the same transaction (e.g. order placed + out for delivery) into a single card with full update history. | Multiple `DeliveryTransitItem` objects with matching thread keys | Consolidated `DeliveryTransitItem` with merged ETA, price, perishable flag, and history | Preserves higher stage rank; retains `problem` status | `vendorTransactions.ts:321-400` |
| 13 | Noise Partitioning | 0% Executive Action Queue Leakage | Partitions items using `agency_level === 0 || isDeliveryTransitItem(item)` into Logistics Radar, isolating the Executive Action Queue. | Array of `PrepItem` records | `{ actionableItems: PrepItem[], deliveryTransitItems: DeliveryTransitItem[] }` | If item is delivery or agency 0, strictly routes to Inbound Manifest | `needsYouFeed.ts:74-94` |
| 14 | Active Learning | Household Capture Rule Ingestion | Matches and injects learned sender, domain, and subject directives from `household_capture_rules` into LLM prompts. | Domain, sender email, subject | Injected text prompt directive block | Falls back to `settings.household_capture_rules` if migration unapplied | `scan-gmail-inbox/index.ts:65-127` |
| 15 | Active Learning | Auto-Training from User Label 'Casa' | Automatically synthesizes capture rules when an email is labeled `'Casa'` in Gmail, persisting domain/sender directives. | Message headers, label list | New/updated `household_capture_rules` record (`origin: 'user_label'`, `confidence: 1.0`) | Skips generic public email providers (gmail.com, yahoo.com, etc.) | `scan-gmail-inbox/index.ts:1332-1354` |
| 16 | Active Learning | Kiosk Sidecar Policy Synthesis | Saves structured capture rules directly from kiosk inspection sidecar actions (Keep Waivers Only, Track Logistics Radar, Mute Sender). | User click action, domain, sender, directive text | Persisted rule in `household_capture_rules` and incremented suppression count | Handles conflict via onConflict update | `ActionInspectionSidecar.tsx:1650-1780` |
| 17 | Active Learning | Dynamic Few-Shot Exemplar Memory Store | Schema and query engine retrieving runtime few-shot exemplars by domain and archetype similarity for tricky vendors. | Domain, sender pattern, email archetype | Injected few-shot input/output exemplar pair in prompt | Defaults to standard prompt if no matching exemplar found | `PROJECT.md:80-92`, Migration `20260824010000` |
| 18 | Knowledge Store | Family Knowledge Claims Extraction | Extracts operational facts, schedules, and policies into `family_knowledge_claims` and `family_data_documents` RAG index. | Redacted email text, metadata, privacy class | Claims in `family_knowledge_claims` and tsvector/pgvector chunks | Redacts SSNs, credit cards, PINs, passwords before storing | `_shared/family-email-evidence.mjs:1-79` |
| 19 | Resolution | Action Resolution Tombstoning | Ensures completed or dismissed action keys never regenerate on subsequent inbox scans via `prep_item_resolutions`. | `action_key`, `prep_item_id`, `outcome` | Record in `prep_item_resolutions`, `prep_items.dismissed = true` | DB trigger intercepts duplicate inserts | `20260715251000_make_prep_completion_durable.sql` |
| 20 | Kiosk UI | Omnichannel 3-Click Navigation & Touch Targets | Full inspection drawer (`ActionInspectionSidecar.tsx`) with 1-tap actions (`Mark Done`, `+ Add to Calendar`) and minimum 44px touch targets. | Touch interaction on mobile, tablet, or 1080p kiosk | Instant state change, in-place 3D flip inspection | Zero modal stack traps; adheres to 10 experience certification gates | `TurboCanvasView.tsx`, `ActionQueueWidget.tsx` |

---

## 2. Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Order Normalization | Walmart unhyphenated order number `200015480824348` | Successfully normalized to canonical hyphenated key `2000154-80824348` and threadKey `transaction:walmart:2000154-80824348`. |
| 2 | Order Normalization | Amazon 17-digit unhyphenated order number `11284729104829103` | Successfully normalized to canonical 3-7-7 format `112-8472910-4829103`. |
| 3 | Order Normalization | Apple Web Order Number `w123456789` (lowercase) | Converted to uppercase `W123456789` and threadKey `transaction:apple:w123456789`. |
| 4 | Order Normalization | Nike Order Number `c0123456789` (lowercase) | Converted to uppercase `C0123456789` and threadKey `transaction:nike:c0123456789`. |
| 5 | Carrier Tracking | Jiffy email containing both order `#2541442349` and UPS tracking `1Z9999999999999999` | Normalizes order ID and links courier tracking into transaction update history without creating duplicate items. |
| 6 | Lifecycle State Machine | Jiffy order confirmation received on Saturday Aug 22 with text "Arriving Monday, Aug 24" | Stage evaluated on Saturday Aug 22 stays `confirmed` (In Transit / Scheduled Later); Future Date Guardrail prevents premature `delivered` status. |
| 7 | Lifecycle State Machine | Walmart "Order is being prepared" / "Last minute to add items" received after order placed | Stage stays `confirmed` (Step 0) and does NOT advance to `out_for_delivery` or `delivered`. |
| 8 | Lifecycle State Machine | Walmart delivery email marked `out_for_delivery` on Wednesday Aug 19 evaluated on Thursday Aug 20 | Past courier auto-resolution automatically transitions the item to `delivered` with ETA display `"Delivered yesterday"`. |
| 9 | Policy Disclaimers | Jiffy email: "Claims for missing, wrong, or damaged items must be made within 3 days (by Thursday, Aug 27)" | Retains policy text in `policy_disclaimer`, assigns `agency_level: 0`, and produces **0 items** in Executive Action Queue and **0** calendar events. |
| 10 | Compound Newsletters | School Newsletter containing Curriculum Night flyer with 6th Grade session (5:30pm), 7th/8th Grade session (6:45pm), and PTSA form | Decomposes into 5 discrete items: 1 prep task, 2 calendar events, 1 form waiver, and 1 quick link, with discrete selection in sidecar. |
| 11 | Multimodal PDF Flyers | Attached PDF testing letter with "FAST ELA Sept 15" and "No Smartwatches Allowed" | Extracts testing dates into suggested calendar events and equipment rules into prep reminders with `source_origin: 'attachment'`. |
| 12 | Relative Date Anchoring | Email sent on `2026-08-10` saying "Open house is tomorrow at 6pm" scanned on `2026-08-23` | Start datetime is anchored strictly to sent date: `2026-08-11T18:00:00`, NEVER today's scan date (`2026-08-23`). |
| 13 | Cross-Account Delivery | Identical school email delivered to `taborfamilyemail@gmail.com` and `jacobrtabor@gmail.com` | `canonicalEmailKey` produces identical `rfc:<internet-message-id>`, creating only 1 row in `canonical_inbox_emails` and skipping second ingest pass. |
| 14 | Noise Suppression | Recurring promotional newsletter downvoted 2 times by user | Suppression strength reaches 2, triggering auto-suppression on future incoming deliveries from that pattern. |
| 15 | Voice Rule Override | Voice command: "Tennis clinic emails from coach@palmbeachtennis.com are informational" | Synthesizes `household_capture_rules` entry with `origin: 'voice_directive'`, routing future emails to Estate Knowledge Feed. |

---

## 3. Detailed Technical Specifications

### 3.1 The 6 Email Archetypes & Agency Levels

Casa Tabor's autonomous ingestion pipeline classifies every inbound message into one of 6 household semantic archetypes, assigning precise agency levels and confidence thresholds:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             6 HOUSEHOLD EMAIL ARCHETYPES                         │
├──────────────────────────┬────────────────────────────┬──────────────────────────┤
│ 1. Logistics & Parcels   │ 2. Executive Actions       │ 3. Temporal Appointments │
│ • Agency Level: 0        │ • Agency Level: 1 – 3      │ • Agency Level: 1        │
│ • Target: Inbound Radar  │ • Target: Action Queue     │ • Target: Suggested Evts │
├──────────────────────────┼────────────────────────────┼──────────────────────────┤
│ 4. Lifecycle Updates     │ 5. Estate Knowledge        │ 6. Promotional Noise     │
│ • Agency Level: 0 / 1    │ • Agency Level: 0          │ • Agency Level: 0        │
│ • Target: In-Place Patch │ • Target: RAG Evidence     │ • Target: Skipped/Muted  │
└──────────────────────────┴────────────────────────────┴──────────────────────────┘
```

#### Detailed Archetype Breakdown:

1. **Logistics & Parcels (`logistics_parcels`)**
   - **Scope**: E-commerce purchases, grocery deliveries (Walmart+ InHome, Instacart), courier shipments (UPS, FedEx, USPS, DHL), meal kit subscriptions (HelloFresh).
   - **Agency Level**: `0` (Autonomous / Passive Tracking).
   - **Routing Destination**: Estate Logistics Radar / Inbound Manifest (`EstateLogisticsWidget.tsx`).
   - **Guarantees**: 0% false leakage into Executive Action Queue (`agency_level === 0`).
   - **Confidence Threshold**: $\ge 0.90$ for extraction; $\ge 0.95$ for vendor identity.

2. **Executive Action Tasks (`executive_actions`)**
   - **Scope**: Required school permission slips, field trip waivers, medical forms, unpaid bills, tuition statements, sports registrations, digital signatures.
   - **Agency Level**: `1` (Standard Review), `2` (High Priority), `3` (Urgent / Past Due / Immediate Disconnection risk).
   - **Routing Destination**: Executive Action Queue (`ActionQueueWidget.tsx`).
   - **Guarantees**: Pinned 1-tap action buttons (`Mark Done`, `Mark Paid ($amount)`, `Mark Signed & Done`).
   - **Enforced Taxonomy**: `forms_paperwork`, `bills_payments`, `rsvp_response`, `gift_occasion`, `medical_health`, `travel_trips`, `household_errands`, `general_todo`.

3. **Temporal Appointments (`temporal_appointments`)**
   - **Scope**: Doctor/pediatric checkups, dentist visits, school orientations, open houses, picture days, games, tournaments, tryouts.
   - **Agency Level**: `1` (Draft Suggestion).
   - **Routing Destination**: Suggested Events Banner (`prep_items` with `source_pattern_key: 'event_suggestion'`).
   - **Guarantees**: **Never auto-injected silently into main calendar**. Surfaces 1-Tap `+ Add to Calendar` in `ActionQueueWidget.tsx`.

4. **Lifecycle State Updates (`lifecycle_updates`)**
   - **Scope**: Flight schedule changes, gate changes, order edits, delivery delay notices, cancellation alerts.
   - **Agency Level**: `0` (Autonomous In-Place State Patch) if normal progression; `1` (Alert / Conflict) if contradicting an existing itinerary or event.
   - **Routing Destination**: In-place update to existing `prep_items` / `trips` record or `email_conflicts` table.

5. **Estate Context & Knowledge (`estate_knowledge`)**
   - **Scope**: HOA policies, school dress codes, supply lists, testing guidelines, pool maintenance directives, recurring newsletters.
   - **Agency Level**: `0` (Passive Knowledge).
   - **Routing Destination**: `family_knowledge_claims` and `family_data_documents` (Vector RAG Index).
   - **Guarantees**: PII redacted before chunking and embedding.

6. **Promotional Noise (`promotional_noise`)**
   - **Scope**: Marketing campaigns, coupons, flash sales, generic digests, solicitations without action items or scheduled events.
   - **Agency Level**: `0` (Muted / Skipped).
   - **Routing Destination**: Terminal `intent: 'skip'` in `gmail_processed_messages`. Zero cards created.

---

### 3.2 Order Number & Tracking Normalization

To ensure multi-stage email updates consolidate into a single composite card without duplication, multi-vendor normalization is deterministically enforced:

#### Vendor Normalization Matrix

| Vendor | Regex Match Pattern | Canonical Transform Function | Canonical Output Format | Example Input $\rightarrow$ Output |
|---|---|---|---|---|
| **Walmart** | `\b(?:2000\|1000)\d{3}-\d{8}\b`<br>`\b(?:2000\|1000)\d{11,13}\b` | `digitsOnly.slice(0, 7) + '-' + digitsOnly.slice(7)` | `#######-########` (7-8 digits) | `200015480824348` $\rightarrow$ `2000154-80824348` |
| **Amazon** | `\b\d{3}-\d{7}-\d{7}\b`<br>`\b\d{17}\b` | `digitsOnly.slice(0, 3) + '-' + digitsOnly.slice(3, 10) + '-' + digitsOnly.slice(10)` | `###-#######-#######` (3-7-7 digits) | `11284729104829103` $\rightarrow$ `112-8472910-4829103` |
| **Apple** | `\bW\d{9,10}\b` (case-insensitive) | `clean.toUpperCase()` | `W#########` | `w987654321` $\rightarrow$ `W987654321` |
| **Nike** | `\b(?:C0\|C-)\d{9,11}\b` | `clean.toUpperCase()` | `C0###########` | `c0123456789` $\rightarrow$ `C0123456789` |
| **Meal Kits** | `\b(?:HF\|GC\|BA\|FACT)-\d{6,10}\b` | `clean.toUpperCase()` | `PREFIX-########` | `hf-12345678` $\rightarrow$ `HF-12345678` |
| **Target** | `\btarget\b[^\d]*(\d{10,14})\b` | `normalizeKeyPart(digits)` | `##########` | `Order #9876543210` $\rightarrow$ `9876543210` |
| **Jiffy / Other** | `\b(?:order\|cart)\s*#?\s*(\d{6,})\b` | `clean.replace(/^#/, '')` | Numeric string | `Cart #50 (Order #2541442349)` $\rightarrow$ `2541442349` |

#### Carrier Detection Matrix

| Carrier | Pattern Format | Canonical Carrier Code | Thread Key Template |
|---|---|---|---|
| **UPS** | `\b1Z[0-9A-Z]{16}\b` (case-insensitive) | `'ups'` | `courier:ups:1Z9999999999999999` |
| **USPS** | `\b9[2345]\d{20,24}\b` | `'usps'` | `courier:usps:9400100000000000000000` |
| **FedEx** | `\b(?:fedex\|tracking)\b[^\d]*(\d{12}\|\d{15}\|\d{20,22})\b` | `'fedex'` | `courier:fedex:123456789012` |
| **DHL** | `\b(?:dhl)\b[^\d]*(\d{10,11})\b` | `'dhl'` | `courier:dhl:1234567890` |

#### Composite Thread Key Priority Hierarchy:
1. `transaction:${vendorKey}:${canonicalOrderId}` (e.g. `transaction:walmart:2000154-80824348`)
2. `courier:${carrier}:${trackingNumber}` (e.g. `courier:ups:1Z9999999999999999`)
3. `delivery:${vendorKey}:${deliveryDateKey}` (e.g. `delivery:walmart:2026-08-23`)
4. `transaction:${vendorKey}:items:${descriptor}` (e.g. `transaction:walmart:items:27-items`)
5. `transaction:${vendorKey}:message:${sourceRef}` (fallback per-message key)

---

### 3.3 Compound Email Decomposition

Complex emails often bundle multiple distinct intents. The Compound Decomposer operates across both email body text and attached PDF/image flyers:

```
                                  INBOUND EMAIL
                                        │
                 ┌──────────────────────┴──────────────────────┐
                 ▼                                             ▼
          HTML / Text Body                             Attached PDF Flyers
                 │                                             │
                 │                                   [Gemini 2.5 Flash OCR]
                 │                                             │
                 ├──────────────────────┬──────────────────────┤
                 ▼                      ▼                      ▼
        [Suggested Events]       [Action Items]         [Knowledge Claims]
        • Open House 5:30pm      • Submit Waiver        • Dress Code Rules
        • Curriculum Night       • Buy Spirit Shirt     • Schedule Dates
        • Sports Tryouts         • Pay Tuition          • Contact Directory
```

#### Multimodal Attachment Pipeline:
1. If email has attachments (`application/pdf`, `image/*`), `fetchGmailAttachment` downloads the base64 content.
2. `extractAttachmentDirectives` passes binary data to `gemini-2.5-flash` with extraction prompt.
3. Produces `extracted_document_summary` containing structured key points.
4. Extracted events (`events[]`) and actions (`actions[]`) carry `source_origin: 'email_body' | 'attachment' | 'compound'`.
5. Frontend sidecar (`ActionInspectionSidecar.tsx`) renders interactive item bundles with toggleable checkboxes.

---

### 3.4 Active Learning & Rule Overrides

Casa Tabor continuously adapts to family preferences without requiring code redeployments or server restarts:

```
                                USER INTERACTION
                                       │
     ┌──────────────────┬──────────────┴───────────────┬──────────────────┐
     ▼                  ▼                              ▼                  ▼
 Gmail Label       Kiosk Sidecar                 Voice Directive      Downvote / Dismiss
   "Casa"         Inspection Modal              "X is informational"   "Not Relevant"
     │                  │                              │                  │
     ▼                  ▼                              ▼                  ▼
[persistLearnedCaptureRule]                   [capture-command-router] [record_prep_item_downvote]
     │                  │                              │                  │
     └──────────────────┼──────────────────────────────┘                  ▼
                        ▼                                      [prep_item_suppressions]
           `household_capture_rules`                           • Strength >= 2: Auto-suppress
           • Domain / Sender / Subject directives              • Strength >= 3: Hard suppress
                        │
                        ▼
           [Runtime Prompt Injection]
           Injected into `classifyEmail` & `extractInboxActions`
```

#### Capture Rules Contract:
- **`pattern_type`**: `'domain'` (e.g. `palmbeachschools.org`), `'sender'` (e.g. `coach@pbtennis.com`), `'subject'` (e.g. `Weekly Update`).
- **`rule_directive`**: Concrete natural language instruction (e.g. `"Route package transit, shipment tracking, and grocery deliveries quietly into Logistics Radar without creating urgent Action Queue prompts."`).
- **`origin`**: `'user_label'`, `'manual_teach'`, `'learned_feedback'`, `'user_untrain'`, `'voice_directive'`, `'fast_dismissal'`.

---

## 4. Exact Schemas & Extraction Contracts

### 4.1 Canonical Entity & Ingestion Result Interface

```typescript
export type DeliveryTransitStage =
  | 'confirmed'
  | 'payment'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'problem'

export interface CanonicalEntityResult {
  vendor: string
  vendorKey: string
  orderId: string | null
  canonicalOrderId: string | null
  trackingNumber: string | null
  carrier: 'ups' | 'fedex' | 'usps' | 'dhl' | null
  compositeThreadKey: string
  effectiveStage: DeliveryTransitStage
  isPerishable: boolean
  cost: string | null
  itemSummary: string
  etaDisplay: string | null
  policyDisclaimer: string | null
  agencyLevel: number // 0 for passive logistics radar, >=1 for executive action
}
```

### 4.2 LLM Extraction JSON Schemas

#### Intent Classifier Schema (`classifyEmail`):
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "EmailClassificationResult",
  "type": "object",
  "required": ["intent"],
  "properties": {
    "intent": {
      "type": "string",
      "enum": ["new_event", "update_event", "travel_detail", "skip"]
    },
    "events": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["title", "start_datetime"],
        "properties": {
          "title": { "type": "string" },
          "start_datetime": { "type": "string" },
          "end_datetime": { "type": "string" },
          "all_day": { "type": "boolean" },
          "location": { "type": "string" },
          "description": { "type": "string" },
          "assigned_member": { "type": "string" }
        }
      }
    },
    "title": { "type": "string" },
    "start_datetime": { "type": "string" },
    "end_datetime": { "type": "string" },
    "all_day": { "type": "boolean" },
    "location": { "type": "string" },
    "description": { "type": "string" },
    "assigned_member": { "type": "string" },
    "updates_event_title": { "type": "string" },
    "updates_event_date": { "type": "string" },
    "change_summary": { "type": "string" },
    "skip_reason": { "type": "string" },
    "family_evidence": {
      "type": "object",
      "properties": {
        "relevant": { "type": "boolean" },
        "category": { "type": "string" },
        "summary": { "type": "string" },
        "entity_names": { "type": "array", "items": { "type": "string" } },
        "effective_at": { "type": "string" },
        "expires_at": { "type": "string" },
        "privacy_class": { "type": "string", "enum": ["standard", "sensitive", "excluded"] },
        "confidence": { "type": "number" }
      }
    }
  }
}
```

#### Inbox Action Extraction Schema (`extractInboxActions`):
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "InboxActionsResult",
  "type": "object",
  "required": ["actions"],
  "properties": {
    "actions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["type", "title", "description"],
        "properties": {
          "type": {
            "type": "string",
            "enum": ["forms", "payment", "rsvp", "deadline", "delivery", "renewal", "general"]
          },
          "title": { "type": "string" },
          "description": { "type": "string" },
          "due_datetime": { "type": "string" },
          "assigned_member": { "type": "string" },
          "priority": { "type": "integer", "enum": [1, 2, 3] },
          "agency_level": { "type": "integer", "enum": [0, 1, 2, 3] },
          "vendor": { "type": "string" },
          "transaction_id": { "type": "string" },
          "transaction_status": {
            "type": "string",
            "enum": ["confirmed", "payment", "shipped", "out_for_delivery", "delivered", "problem", ""]
          },
          "policy_disclaimer": { "type": "string" },
          "source_origin": {
            "type": "string",
            "enum": ["email_body", "attachment", "compound"]
          }
        }
      }
    }
  }
}
```

### 4.3 Database Storage Schemas

```sql
-- 1. Canonical Emails (Cross-Inbox Master)
CREATE TABLE public.canonical_inbox_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_key TEXT UNIQUE NOT NULL,
  gmail_thread_id TEXT,
  internet_message_id TEXT,
  from_email TEXT,
  subject TEXT,
  received_at TIMESTAMPTZ,
  content_fingerprint TEXT NOT NULL,
  content_format TEXT CHECK (content_format IN ('plain', 'html', 'none')),
  attachment_count INTEGER DEFAULT 0 CHECK (attachment_count >= 0),
  mailbox_accounts TEXT[] DEFAULT ARRAY[]::TEXT[],
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Household Capture Rules (Active Learning & Directives)
CREATE TABLE public.household_capture_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('domain', 'sender', 'subject')),
  pattern_value TEXT NOT NULL,
  rule_directive TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('user_label', 'manual_teach', 'learned_feedback', 'user_untrain', 'voice_directive', 'fast_dismissal')),
  confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  active BOOLEAN NOT NULL DEFAULT true,
  default_archetype TEXT,
  category_routing JSONB DEFAULT '{}'::jsonb,
  last_matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pattern_type, lower(pattern_value))
);

-- 3. Dynamic Few-Shot Exemplar Store
CREATE TABLE public.household_few_shot_exemplars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  sender_pattern TEXT,
  email_archetype TEXT NOT NULL CHECK (
    email_archetype IN (
      'logistics_parcels',
      'executive_actions',
      'temporal_appointments',
      'lifecycle_updates',
      'estate_knowledge',
      'promotional_noise'
    )
  ),
  sample_subject TEXT NOT NULL,
  sample_snippet TEXT NOT NULL,
  extracted_output JSONB NOT NULL,
  exemplar_weight DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  active BOOLEAN NOT NULL DEFAULT true,
  last_matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 5. Verification Matrix & Guarantees

| Requirement | Test Method / Command | Acceptance Gate |
|---|---|---|
| **Archetype Accuracy** | `node scripts/email-benchmark-eval.mjs` | $\ge 98\%$ accuracy across all 6 archetypes |
| **0% Queue Leakage** | `node --test tests/vendor-transaction-producer.test.mjs` | 0 delivery transit items in `actionableItems` |
| **Order Normalization** | `node --test tests/vendor-transaction-producer.test.mjs` | Exact normalization for Amazon, Walmart, Apple, Nike, Jiffy |
| **Compound Decomposer** | `node --test tests/gmail-attachment-multimodal-actions.test.mjs` | Correct decomposition into discrete tasks and events |
| **Event Suggestions** | `node --test tests/gmail-event-suggestion-pipeline.test.mjs` | 0 auto-created events, suggestions in `prep_items` |
| **Full Regression Safety** | `npm test` | 1,698 passing tests, 0 failures, 0 regressions |
| **Kiosk Touch & 3-Click** | `npm run certify:experience` | All 10 gates pass, $\ge 44\text{px}/48\text{px}$ touch targets |

---
*Report compiled and verified by Spec Miner 1 for Casa Tabor.*
