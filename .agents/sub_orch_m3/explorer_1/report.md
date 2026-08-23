# Milestone 3 Technical Investigation Report: Deterministic Entity & Canonical Order Resolver

**Author**: Explorer 1  
**Milestone**: Milestone 3 (R3: Deterministic Entity & Canonical Order Resolver)  
**Date**: 2026-08-23  
**Working Directory**: `/Users/taboj/casa-tabor/.agents/sub_orch_m3/explorer_1`  
**Target Files Analyzed**:
- `src/utils/vendorTransactions.ts`
- `src/utils/needsYouFeed.ts`
- `src/utils/actionInspectionSynthesis.ts`
- `src/utils/attentionTopics.ts`
- `src/types/index.ts`
- `src/components/canvas/widgets/EstateLogisticsWidget.tsx`
- `src/components/canvas/widgets/ActionInspectionSidecar.tsx`
- `src/components/canvas/widgets/ActionQueueWidget.tsx`
- `supabase/functions/scan-gmail-inbox/index.ts`
- `supabase/functions/_shared/gmail-canonical-email.mjs`
- `supabase/functions/_shared/family-email-evidence.mjs`
- `supabase/migrations/20260809201500_vendor_transaction_threads.sql`
- `supabase/migrations/20260809203000_refine_vendor_transaction_fallback.sql`
- `tests/vendor-transaction-producer.test.mjs`
- `tests/estate-logistics-radar.test.mjs`

---

## 1. Executive Summary

Milestone 3 (**Deterministic Entity & Canonical Order Resolver**) is responsible for normalizing multi-vendor order numbers and multi-carrier courier tracking identifiers into unified composite thread keys, evaluating tense-aware lifecycle progression across 6 distinct stages (`confirmed`, `payment`, `shipped`, `out_for_delivery`, `delivered`, `problem`), enforcing future arrival date guardrails, enabling past courier auto-resolution, and guaranteeing 0% leakage into the Executive Action Queue.

### Key Investigation Takeaways:
1. **Existing Frontend Capabilities**:
   - `src/utils/vendorTransactions.ts` (741 lines) contains a mature set of client-side utilities including `canonicalizeOrderId`, `orderId`, `transactionStage`, `resolveEffectiveStage`, `mergeDeliveryTransitItem`, and `consolidateTransitItems`.
   - `tests/vendor-transaction-producer.test.mjs` (586 lines, 12 passing tests) confirms client-side normalization for Walmart, Amazon, Apple, Nike, Jiffy, and HelloFresh, alongside future arrival guardrails and 0% Action Queue leakage.
2. **Key Architectural Gaps**:
   - **Missing Shared Edge Module**: `supabase/functions/_shared/canonical-order-resolver.mjs` does **not exist yet**.
   - **Code Duplication in Edge Functions**: `supabase/functions/scan-gmail-inbox/index.ts` (lines 564–670) contains an embedded, partially divergent copy of order normalization and transaction key extraction logic (`transactionIdentity`, `canonicalizeTransactionOrderId`, `transactionDescriptor`, `normalizeTransactionKeyPart`).
   - **Missing Dedicated Edge Test Suite**: `tests/canonical-order-resolver.test.mjs` does **not exist yet** to unit-test the pure shared module in isolation.
   - **Missing Carrier Support (DHL)**: DHL tracking (`10-11` digits, `GM...` eCommerce) is omitted from vendor aliases and tracking regexes.
   - **Key Formatting Standard**: Standalone carrier deliveries currently use `transaction:${carrier}:${tracking}` rather than the contract-specified `courier:${carrier}:${tracking}`.
3. **Current Test Baseline**:
   - Running `npm test` executes **1,698 unit and integration tests across 115 test files with 0 failures** in ~7.8 seconds.
   - All changes in Milestone 3 must preserve 100% pass on this 1,698-test baseline.

---

## 2. Existing Architecture & Code State

### 2.1 File Map & Responsibilities

| File Path | Role / Purpose | Current Status |
|---|---|---|
| `src/utils/vendorTransactions.ts` | Frontend normalizer, lifecycle state resolver, timeline aggregator, and date-based consolidation engine. | Implemented (741 lines); needs harmonization with shared module. |
| `supabase/functions/_shared/canonical-order-resolver.mjs` | Shared pure ES module for canonical order normalization, courier extraction, and stage progression used across Edge functions and tests. | **MISSING** (Needs creation). |
| `supabase/functions/scan-gmail-inbox/index.ts` | Ingests raw Gmail messages, classifies intents, decomposes compound attachments, and persists action items into `prep_items`. | Implemented (1,716 lines); duplicates order parsing inline; needs refactoring to import shared resolver. |
| `src/utils/needsYouFeed.ts` | Feeds coordinator partitioning items into `actionableItems` (Executive Action Queue) vs `deliveryTransitItems` (Logistics Radar). | Implemented; strictly enforces `agency_level === 0 \|\| isDeliveryTransitItem(item)`. |
| `src/utils/actionInspectionSynthesis.ts` | Sidecar synthesis, document preview extraction, and action bundle decomposition; guards against false calendar events from deliveries. | Implemented (1,170 lines); suppresses suggested events/action plans for delivery items. |
| `src/utils/attentionTopics.ts` | Clusters active prep items into topics using `vendorTransactionIdentity` to group order updates. | Implemented (153 lines). |
| `src/components/canvas/widgets/EstateLogisticsWidget.tsx` | Omnichannel kiosk & canvas widget displaying Inbound Manifest with Hero Spotlight slot, 4-stage stepper rail, and temporal buckets. | Implemented (673 lines). |
| `tests/vendor-transaction-producer.test.mjs` | Client-side unit/integration tests verifying multi-vendor normalization, date guardrails, and feed partitioning. | Implemented (586 lines, 12 passing tests). |
| `tests/canonical-order-resolver.test.mjs` | Unit tests for pure `canonical-order-resolver.mjs` shared module across all vendors, carriers, and stage transitions. | **MISSING** (Needs creation). |

### 2.2 Database Schema & Migration Foundation
Database columns supporting canonical order tracking in `public.prep_items`:
- `attention_thread_key TEXT`: Indexed composite thread key (e.g. `transaction:walmart:2000154-80824348`, `courier:ups:1z9999999999999999`).
- `attention_vendor TEXT`: Canonical vendor or courier name (e.g. `Walmart`, `Amazon`, `UPS`).
- `attention_stage TEXT`: Lifecycle stage (`confirmed`, `payment`, `shipped`, `out_for_delivery`, `delivered`, `problem`).
- `agency_level INT`: `0` for passive logistics tracking/disclaimers, `>=1` for human actions.
- `policy_disclaimer TEXT`: Footnotes or return policy text (e.g. "Claims for missing items must be made within 3 days").
- `cluster_id TEXT`: Sibling email cluster ID for multi-item decomposition.
- `source_origin TEXT`: `email_body`, `attachment`, or `compound`.

Migrations verified:
- `20260809201500_vendor_transaction_threads.sql`: Adds `attention_thread_key`, `attention_vendor`, `attention_stage`, and index `prep_items_attention_thread_idx`.
- `20260809203000_refine_vendor_transaction_fallback.sql`: Refines item descriptor fallback (`transaction:walmart:items:...`).
- `20260816020000_household_capture_rules.sql`: Adds `household_capture_rules`, `is_user_labeled`, and `cluster_id`.
- `20260822080000_gmail_attachments_and_document_summaries.sql`: Adds `attachments`, `extracted_document_summary`, and `source_origin`.

---

## 3. Interfaces, Signatures, and Types

### 3.1 Authoritative Interface Contracts

#### 1. Canonical Entity Result Contract (`PROJECT.md §Interface Contracts`)
```typescript
export interface CanonicalEntityResult {
  vendor: string
  vendorKey: string
  orderId: string | null
  canonicalOrderId: string | null
  trackingNumber: string | null
  carrier: 'ups' | 'fedex' | 'usps' | 'dhl' | null
  compositeThreadKey: string
  effectiveStage: 'confirmed' | 'payment' | 'shipped' | 'out_for_delivery' | 'delivered' | 'problem'
  rawStage: 'confirmed' | 'payment' | 'shipped' | 'out_for_delivery' | 'delivered' | 'problem'
  isPerishable: boolean
  cost: string | null
  itemSummary: string | null
  etaDisplay: string | null
  deliveryDate: string | null // ISO YYYY-MM-DD
  policyDisclaimer: string | null
  agencyLevel: number // 0 for passive logistics radar, >=1 for human action
}
```

#### 2. Client Delivery Transit Item Contract (`src/types/index.ts`)
```typescript
export type DeliveryTransitStage =
  | 'confirmed'
  | 'payment'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'problem'

export interface DeliveryUpdateEvent {
  id: string
  title: string
  description?: string | null
  stage: DeliveryTransitStage
  occurredAt: string
  sourceRef?: string | null
  rawItem?: PrepItem
}

export interface DeliveryTransitItem {
  id: string
  threadKey: string
  vendor: string
  title: string
  itemSummary: string | null
  stage: DeliveryTransitStage
  cost?: string | null
  trackingUrl?: string | null
  carrier?: string | null
  etaDisplay?: string | null
  isPerishable?: boolean
  occurredAt: string
  rawItem: PrepItem
  policyDisclaimer?: string | null
  updateHistory?: DeliveryUpdateEvent[]
}
```

### 3.2 Canonical Resolver Module Function Signatures
Target function signatures for `supabase/functions/_shared/canonical-order-resolver.mjs`:

```javascript
/**
 * Canonicalizes raw order number into standardized string for known vendors
 * @param {string} vendor 
 * @param {string} rawId 
 * @returns {string}
 */
export function canonicalizeOrderId(vendor, rawId);

/**
 * Extracts and standardizes courier tracking number
 * @param {'ups' | 'fedex' | 'usps' | 'dhl' | null} carrier 
 * @param {string} rawTracking 
 * @returns {string}
 */
export function canonicalizeTrackingNumber(carrier, rawTracking);

/**
 * Detects carrier and tracking number from text
 * @param {string} text 
 * @returns {{ carrier: 'ups' | 'fedex' | 'usps' | 'dhl' | null, trackingNumber: string | null, trackingUrl: string | null }}
 */
export function detectCarrierAndTracking(text);

/**
 * Detects vendor and order ID from text
 * @param {string} text 
 * @param {string} [vendorHint]
 * @returns {{ vendor: string | null, vendorKey: string | null, orderId: string | null, canonicalOrderId: string | null }}
 */
export function detectVendorAndOrder(text, vendorHint);

/**
 * Builds deterministic composite thread key
 * @param {{ vendorKey?: string, orderId?: string, carrier?: string, trackingNumber?: string, dateKey?: string, sourceRef?: string }} params 
 * @returns {string}
 */
export function buildCompositeThreadKey(params);

/**
 * Determines stage from text indicators and attention fields
 * @param {object} item 
 * @returns {DeliveryTransitStage}
 */
export function resolveTransactionStage(item);

/**
 * Applies future arrival guardrails and past courier auto-resolution
 * @param {DeliveryTransitStage} rawStage 
 * @param {Date | string | null} deliveryDate 
 * @param {Date} [now]
 * @returns {DeliveryTransitStage}
 */
export function resolveEffectiveStage(rawStage, deliveryDate, now);

/**
 * Extracts return or claim policy disclaimer footnote
 * @param {string} text 
 * @returns {string | null}
 */
export function extractPolicyDisclaimer(text);

/**
 * Determines if item describes perishable grocery or meal kit
 * @param {string} text 
 * @returns {boolean}
 */
export function isPerishableDelivery(text);

/**
 * Full deterministic entity resolver resolving all fields conforming to CanonicalEntityResult
 * @param {object} input 
 * @param {{ now?: Date }} [options]
 * @returns {CanonicalEntityResult}
 */
export function resolveCanonicalEntity(input, options);
```

---

## 4. Multi-Vendor & Carrier Normalization Rules & Edge Cases

### 4.1 Vendor Normalization Matrix

| Vendor | Detection Patterns | Normalization Rules | Input Variations Handled | Canonical Format |
|---|---|---|---|---|
| **Walmart** | `walmart`, `walmart+`, `inhome`, `walmart grocery` | Digits-only check. If length is 15 or 16, format as `7-8` (`${d.slice(0,7)}-${d.slice(7)}`). Strip `WM-`, `#`, `Order #`. | `2000154-80824348`<br>`200015480824348`<br>`Order #2000154-80824348`<br>`WM-2000154-80824348`<br>`orderId=200015480824348` | `2000154-80824348` |
| **Amazon** | `amazon.com`, `amazon`, `prime`, `amazon fresh` | Digits-only check. If length is 17, format as `3-7-7` (`${d.slice(0,3)}-${d.slice(3,10)}-${d.slice(10)}`). Also support digital order `D01-...`. | `112-8472910-4829103`<br>`11284729104829103`<br>`Order # 112-8472910-4829103`<br>`order-id: 112-8472910-4829103` | `112-8472910-4829103` |
| **Apple** | `apple.com`, `apple store`, `apple` | Case-insensitive `W` prefix followed by 9-10 digits. Convert to uppercase `WXXXXXXXXX`. | `w123456789`<br>`W123456789`<br>`Order Number: W987654321` | `W123456789` |
| **Nike** | `nike.com`, `nike` | Case-insensitive `C0` or `C-` followed by 9-11 digits. Normalize to uppercase `C0XXXXXXXXX`. | `c0123456789`<br>`C0123456789`<br>`C-0123456789` | `C0123456789` |
| **Target** | `target.com`, `target`, `shipt` | 10-14 digit standalone numeric sequence associated with Target context or order label. | `Target Order: 987654321012`<br>`#987654321012`<br>`orderId=987654321012` | `987654321012` |
| **Jiffy** | `jiffy.com`, `jiffy transfers`, `jiffy shirts` | 10-digit numeric sequence. Disambiguate from Cart ID (e.g. `Cart #50`). | `Order #2541442349`<br>`Jacob's Cart #50 (Order #2541442349)` | `2541442349` |
| **HelloFresh & Meal Kits** | `hellofresh`, `greenchef`, `factor75`, `blue apron` | Prefixes `HF-`, `GC-`, `BA-`, `FACT-` followed by 6-10 digits. Uppercase conversion. Flags `isPerishable: true`. | `hf-12345678`<br>`HF-12345678`<br>`GC-98765432` | `HF-12345678` |

### 4.2 Courier Tracking Normalization Matrix

| Carrier | Tracking Number Regex | Check / Clean Rule | Standalone Thread Key | Tracking URL |
|---|---|---|---|---|
| **UPS** | `\b1Z[0-9A-Z]{16}\b` (or `\b92\d{20,32}\b` Mail Innovations) | Strip whitespace/dashes, uppercase. | `courier:ups:1z9999999999999999` | `https://www.ups.com/track?tracknum=${tracking}` |
| **FedEx** | `\b(?:fedex\|tracking)\b[^\d]*(\d{12}\|\d{14}\|\d{15}\|\d{20,22})\b` or standalone `12/15` digits | Strip whitespace/dashes. | `courier:fedex:987654321012` | `https://www.fedex.com/fedextrack/?trknbr=${tracking}` |
| **USPS** | `\b(9[2345]\d{20,24})\b` or `\b([A-Z]{2}\d{9}[A-Z]{2})\b` (International UPU S10) | Strip spaces/dashes, uppercase. | `courier:usps:9400100000000000000000` | `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tracking}` |
| **DHL** | `\b(?:dhl\|tracking)\b[^\d]*(\d{10,11})\b` or `\b(?:GM\|LX\|RX\|JD)\d{10,20}\b` | Strip spaces/dashes, uppercase. | `courier:dhl:1234567890` | `https://www.dhl.com/en/express/tracking.html?AWB=${tracking}` |

---

## 5. Lifecycle State Progression & Date Guardrail Invariants

### 5.1 6-Stage Monotonic State Machine

```
[confirmed] ────► [payment] ────► [shipped] ────► [out_for_delivery] ────► [delivered]
    │                                                                           ▲
    └────────────────────── (Problem / Cancellation) ──► [problem] ─────────────┘
```

1. **Stage Priority Ranks**:
   - `confirmed`: Rank 0 (Stepper Step 0)
   - `payment`: Rank 0 (Stepper Step 0)
   - `shipped`: Rank 1 (Stepper Step 1)
   - `out_for_delivery`: Rank 2 (Stepper Step 2)
   - `delivered`: Rank 3 (Stepper Step 3)
   - `problem`: Rank -1 (Stepper Step -1)
2. **Monotonic Forward Progression**:
   - Newer updates with higher rank advance the merged stage.
   - Late-arriving payment notices (e.g. credit card charge receipt arriving 2 hours after package shipped) **never regress** `shipped` or `out_for_delivery` backwards.
3. **In-Preparation Lock**:
   - If latest text explicitly indicates preparation/editing window (`being prepared`, `last minute to add items`, `edit your order`), the stage is pinned to `confirmed` (Stepper Step 0) to preserve the user action window.
4. **Problem State Dominance**:
   - An explicit delivery failure, damage report, or cancellation immediately sets stage to `problem`.
   - Standard policy disclaimers (*"Claims for missing items must be made within 3 days"*) are **not** treated as problems.

### 5.2 Future Arrival Date Guardrail
- **Invariant**: If `deliveryDate` > `now` (calendar day strictly in future), `resolveEffectiveStage` overrides `delivered` to `confirmed` or `shipped`.
- **Guarantees**: Order confirmation emails received on Saturday for delivery on Monday will **never** resolve to `delivered` on Saturday, even if ambiguous past-tense words appear in the email.

### 5.3 Past Courier Auto-Resolution Rule
- **Invariant**: Same-day courier dispatches (`out_for_delivery`) from past calendar days (`deliveryDate` < `now`) automatically transition to `delivered`.
- **Exclusion**: Orders in `confirmed`, `payment`, or `shipped` stages from past days do **not** auto-resolve to `delivered`, as warehouse fulfillment and long-haul freight transit take multiple days.

### 5.4 0% Executive Action Queue Leakage
- **Invariant**: All items where `agency_level === 0` or `isDeliveryTransitItem(item) === true` are partitioned by `splitActionableAndTransitItems` into `deliveryTransitItems`.
- **Policy Disclaimers**: Return windows and claim policies are stored on `policyDisclaimer` metadata without creating action queue rows or calendar suggestions.

---

## 6. Identified Gaps & Missing Logic

| # | Identified Gap | Current Status / File | Milestone 3 Requirement | Impact / Risk |
|---|---|---|---|---|
| **1** | **Missing Shared Resolver Module** | `supabase/functions/_shared/canonical-order-resolver.mjs` does not exist. | Create pure ES module exporting all canonical resolver utilities conforming to `CanonicalEntityResult`. | High: Edge functions currently cannot share single source of truth. |
| **2** | **Duplicated Edge Ingestion Logic** | `supabase/functions/scan-gmail-inbox/index.ts:564-670` has duplicate `transactionIdentity()` and `canonicalizeTransactionOrderId()`. | Refactor `scan-gmail-inbox` to import and use `_shared/canonical-order-resolver.mjs`. | Medium: Code drift between frontend and backend ingestion. |
| **3** | **Missing Standalone Unit Test Suite** | `tests/canonical-order-resolver.test.mjs` does not exist. | Create dedicated test suite covering all vendors, carriers, composite keys, guardrails, and 0% leakage. | High: Needed for comprehensive regression certification. |
| **4** | **Missing DHL Carrier Support** | DHL is omitted from `VENDOR_ALIASES`, carrier detection, and tracking URL generators. | Add DHL Express (`10-11` digits) and eCommerce (`GM...`) patterns, normalization, and URLs. | Low: Incomplete carrier coverage for international orders. |
| **5** | **Composite Key Standardization** | Standalone courier items currently use `transaction:${carrier}:${tracking}`. | Standardize standalone courier keys to `courier:${carrier}:${tracking}` per PROJECT.md spec. | Medium: Alignment with system interface contracts. |
| **6** | **Edge Cases in Normalization** | Raw inputs with whitespace (e.g. `9400 1000 0000 0000 00`), URL params (`orderId=...`), and leading prefixes (`WM-`). | Enhance regex sanitization and normalization rules in shared resolver. | Medium: Robustness against varied raw email formats. |

---

## 7. Recommended Implementation Strategy for the Worker

### Phase 1: Build Shared Canonical Resolver Module
Create `supabase/functions/_shared/canonical-order-resolver.mjs`:
- Export `resolveCanonicalEntity`, `canonicalizeOrderId`, `canonicalizeTrackingNumber`, `detectCarrierAndTracking`, `detectVendorAndOrder`, `buildCompositeThreadKey`, `resolveTransactionStage`, `resolveEffectiveStage`, `extractPolicyDisclaimer`, `isPerishableDelivery`, `formatDeliveryEta`.
- Implement robust multi-vendor normalization for Walmart (15/16-digit 7-8), Amazon (17-digit 3-7-7), Apple (`W`), Nike (`C0`/`C-`), Target, Jiffy, and HelloFresh (`HF-`/`GC-`/`BA-`/`FACT-`).
- Implement multi-carrier normalization for UPS (`1Z`), FedEx (`12/15/20/22`), USPS (`92/93/94/95`/international `S10`), and DHL (`10/11`/`GM...`).
- Implement composite thread keys: `transaction:${vendorKey}:${orderId}` and `courier:${carrier}:${tracking}`.
- Implement future arrival date guardrail and past same-day courier auto-resolution.

### Phase 2: Refactor Edge Ingestion Engine
Update `supabase/functions/scan-gmail-inbox/index.ts`:
- Import `resolveCanonicalEntity`, `buildCompositeThreadKey`, and helper functions from `../_shared/canonical-order-resolver.mjs`.
- Replace inline duplicated parsing logic with calls to the shared resolver.
- Ensure `attention_thread_key`, `attention_vendor`, `attention_stage`, `agency_level: 0`, and `policy_disclaimer` are populated consistently.

### Phase 3: Synchronize Client Utilities
Update `src/utils/vendorTransactions.ts`:
- Harmonize parsing rules, vendor aliases (add DHL), and carrier normalization with `_shared/canonical-order-resolver.mjs`.
- Ensure `courier:${carrier}:${tracking}` format is recognized alongside existing `transaction:...` keys.
- Retain React-optimized helpers: `buildDeliveryTransitItem`, `consolidateTransitItems`, `mergeDeliveryTransitItem`, `isItemArrivingToday`, `isItemInTransit`, `isItemDelivered`.

### Phase 4: Create Comprehensive Test Suite
Create `tests/canonical-order-resolver.test.mjs`:
- Multi-vendor canonicalization unit tests (Walmart, Amazon, Apple, Nike, Target, Jiffy, HelloFresh).
- Multi-carrier courier tracking tests (UPS, FedEx, USPS, DHL).
- Composite thread key generation and cross-referencing tests.
- Lifecycle stage progression and monotonic ordering tests.
- Future arrival date guardrail tests.
- Past courier auto-resolution tests.
- 0% Action Queue leakage and policy disclaimer extraction tests.
- Update `tests/vendor-transaction-producer.test.mjs` with any supplementary integration scenarios.

### Phase 5: Full Regression Certification
- Run `node --test tests/canonical-order-resolver.test.mjs`
- Run `node --test tests/vendor-transaction-producer.test.mjs`
- Run `npm test` (verify all 1,698+ tests pass with 0 failures)
- Run `npm run build` (verify TypeScript typecheck and build succeed with 0 errors)

---

## 8. Summary of Findings for Milestone 3 Worker

| Area | Key Instruction for Worker |
|---|---|
| **Module to Create** | `supabase/functions/_shared/canonical-order-resolver.mjs` (pure ES module). |
| **Test Suite to Create** | `tests/canonical-order-resolver.test.mjs` (native `node:test` suite). |
| **Files to Update** | `supabase/functions/scan-gmail-inbox/index.ts`, `src/utils/vendorTransactions.ts`, `tests/vendor-transaction-producer.test.mjs`. |
| **Contract to Satisfy** | `CanonicalEntityResult` in `PROJECT.md §Interface Contracts`. |
| **Regression Guard** | Zero modifications that break existing 1,698 unit tests (`npm test`). |
