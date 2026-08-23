# Milestone 3 Test Infrastructure & Test Suite Investigation Report
**Explorer 2 Investigation Report**  
**Working Directory**: `/Users/taboj/casa-tabor/.agents/sub_orch_m3/explorer_2/`  
**Target Milestone**: Milestone 3: Deterministic Entity & Canonical Order Resolver  
**Timestamp**: 2026-08-23T11:48:30Z  

---

## 1. Executive Summary & Test Infrastructure Overview

This investigation analyzes the test runner architecture, existing test suites, coverage gaps, and all required test cases for **Milestone 3: Deterministic Entity & Canonical Order Resolver**.

### Key Findings
1. **Test Runner & Harness**:
   - The repository uses Node's native test runner (`node:test`) and assertion library (`node:assert/strict`) driven by `"test": "node --test tests/*.test.mjs"` in `package.json`.
   - Node 22+ native TypeScript type stripping allows direct runtime importation of `.ts` files (e.g. `src/utils/vendorTransactions.ts`, `src/utils/needsYouFeed.ts`) and `.mjs` shared modules without intermediate build artifacts.
   - Full regression suite currently runs **1,698 tests across 115 test files with 0 failures** in ~7.8 seconds.

2. **Existing vs Missing Test Files**:
   - `tests/vendor-transaction-producer.test.mjs` **exists** (586 lines, 12 test suites) testing UI/client-side vendor transaction logic, composite thread keying, and feed partitioning.
   - `tests/canonical-order-resolver.test.mjs` **does NOT exist yet** and must be created to unit test the shared backend resolver module (`supabase/functions/_shared/canonical-order-resolver.mjs`).
   - `supabase/functions/_shared/canonical-order-resolver.mjs` **does NOT exist yet**; `scan-gmail-inbox/index.ts` currently contains an inline duplicated partial parser (`transactionIdentity()`, `canonicalizeTransactionOrderId()`) which needs extraction and unification.
   - `tests/fixtures/email-benchmark.json` **does NOT exist yet** (scoped to Milestone 2).

3. **Milestone 3 Test Scope**:
   A complete test matrix has been designed covering all 6 core functional areas of Milestone 3:
   - Normalization of 7 major vendors (Walmart, Amazon, Target, Apple, Nike, Jiffy, HelloFresh).
   - Normalization of 4 courier carriers (UPS, FedEx, USPS, DHL) and composite thread keys.
   - 6-state tense-aware lifecycle progression state machine with anti-regression rules.
   - Future arrival date guardrails (preventing premature `delivered` marking).
   - Past courier auto-resolution (same-day dispatches resolving on next day).
   - 0% leakage into Executive Action Queue (`agency_level: 0`, passive `policy_disclaimer` extraction).

---

## 2. Existing Test Infrastructure & Current State Analysis

### 2.1 Test Runners & Tooling Configuration

| Component | Technology | Configuration / Location | Execution Command |
|---|---|---|---|
| **Unit & Integration Runner** | `node:test` (Native Node Test Runner) | `tests/*.test.mjs` | `npm test` (`node --test tests/*.test.mjs`) |
| **Assertion Library** | `node:assert/strict` | Native Node ESM imports | `import assert from 'node:assert/strict'` |
| **Visual Regression Runner** | `@playwright/test` v1.61.1 | `playwright.config.ts` | `npm run test:visual` |
| **Type Checker** | TypeScript ~6.0.2 | `tsconfig.json` | `tsc -b` (runs in `npm run build`) |
| **Code Linter** | ESLint v10.3.0 | `eslint.config.js` | `npm run lint` |
| **Design System & Style Audits**| Custom Node scripts | `scripts/style-audit.mjs` | `npm run style:check`, `npm run certify:experience` |

### 2.2 Analysis of `tests/vendor-transaction-producer.test.mjs`

`tests/vendor-transaction-producer.test.mjs` contains 12 unit and integration tests covering:
1. `Gmail action extraction stores reusable vendor transaction identity`: Static code regex assertion on `scan-gmail-inbox/index.ts`.
2. `migration adds indexed transaction identity and backfills current Walmart rows`: Static regex assertion on SQL migrations (`20260809201500_vendor_transaction_threads.sql`, `20260809203000_refine_vendor_transaction_fallback.sql`).
3. `Home and Action Center label grouped transactions as updates`: Static regex assertion on `HomeRightPanel.tsx` and `ActionHubPage.tsx`.
4. `vendor transaction identity clusters multiple Walmart emails into a single delivery key on the same date`: Verifies date-based thread key clustering (`delivery:walmart:2026-08-19`).
5. `real Supabase records with Walmart+ InHome compound keys merge seamlessly into 1 Hero item`: Verifies merging of pricing hold ($138.65) and delivery window (3:44pm, 2pm–6pm) into 1 Hero item.
6. `past out-for-delivery records automatically transition to delivered when evaluated on next day`: Tests date-aware evaluation on past `out_for_delivery` vs active today.
7. `Jiffy order confirmation with future arrival date (Monday Aug 24) stays In Transit / Scheduled Later and NOT delivered on Saturday Aug 22`: Verifies future date guardrails across multi-email progression (confirmation on Saturday -> shipping update on Sunday).
8. `future-tense delivery strings never trigger delivered stage`: Tests "will be delivered", "scheduled to be delivered" vs "has been delivered".
9. `Jiffy order shipment with claims policy disclaimer consolidates into delivery transit and creates 0 actionable items and 0 calendar suggestions`: Verifies 0% leakage, no false calendar appointments, no false suggested action plans.
10. `compound school spirit order cleanly splits into 1 delivery in Inbound Manifest and 1 calendar event with 0 Action Queue leakage`: Verifies `agency_level: 0` and `policy_disclaimer` extraction.
11. `Walmart InHome: Thanks for order + Last minute to add items merge into 1 order, stage confirmed (Being Prepared), and arriving today`: Verifies "Being Prepared" / "Last minute to add items" maps to `confirmed` (step 0).
12. `multi-vendor order number canonicalization accurately normalizes Walmart, Amazon, Target, Apple, Nike, Jiffy, and HelloFresh`: Basic sanity check of `canonicalizeOrderId`.

### 2.3 Gaps in Current Test Coverage

While `tests/vendor-transaction-producer.test.mjs` provides strong frontend utility verification, several critical gaps remain:
1. **No Shared Edge Function Resolver Test Suite**: No `tests/canonical-order-resolver.test.mjs` exists to test backend edge function ingestion in isolation.
2. **Missing Courier Tracking Test Cases**: No dedicated tests for raw courier tracking numbers across UPS, FedEx, USPS, and DHL when received as standalone courier notifications without an order number.
3. **Missing Cross-Carrier Composite Key Resolution**: No test verifies the multi-stage correlation where Email A contains `Order #12345` with carrier `UPS` tracking `1Z...`, and Email B is an automated carrier email from UPS with tracking `1Z...`.
4. **Missing Edge Cases in Order Canonicalization**:
   - Amazon: URL query parameter formats (`orderId=114-1234567-7654321`), multi-order digests.
   - Target: Shipt / Circle 360 delivery format differences, alphanumeric order IDs.
   - Apple: Format variations with spaces or lowercase (`w 123456789`, `apple store #w123456789`).
   - Nike: Hyphenated prefix (`C-0123456789`) vs unhyphenated (`c0123456789`).
   - HelloFresh: Green Chef (`GC-`), Blue Apron (`BA-`), Factor (`FACT-`) meal kit order key normalization.
5. **Contract Conformance**: The return contract of `supabase/functions/_shared/canonical-order-resolver.mjs` (`CanonicalEntityResult`) defined in `PROJECT.md §Interface Contracts` needs direct unit test validation.

---

## 3. Comprehensive Milestone 3 Test Matrix & Required Test Cases

### 3.1 Multi-Vendor Order Number Normalization Test Suite

| Vendor | Raw Input Variants | Expected Canonical Order ID | Expected Composite Thread Key | Key Normalization Rules |
|---|---|---|---|---|
| **Walmart** | `2000154-80824348`<br>`200015480824348`<br>`Order #2000154-80824348`<br>`WM-2000154-80824348`<br>`orderId=200015480824348` | `2000154-80824348` | `transaction:walmart:2000154-80824348` | Strip non-digits; split 15/16 digits into 7-8 format (`XXXXXXX-XXXXXXXX`). Map `Walmart+ InHome` and `Walmart Grocery` to `walmart`. |
| **Amazon** | `112-8472910-4829103`<br>`11284729104829103`<br>`Order # 112-8472910-4829103`<br>`order-id: 112-8472910-4829103` | `112-8472910-4829103` | `transaction:amazon:112-8472910-4829103` | Strip non-digits; format 17 digits into 3-7-7 (`XXX-XXXXXXX-XXXXXXX`). Map `Amazon Prime`, `Amazon Fresh`, `Amazon.com` to `amazon`. |
| **Target** | `9823746152`<br>`Order # 9823746152`<br>`target.com/orders/982374615201`<br>`Target Order: 9823746152` | `9823746152` | `transaction:target:9823746152` | Extract 10-14 digit numeric order sequences associated with Target / Shipt. |
| **Apple** | `W123456789`<br>`w123456789`<br>`Order Number: W987654321`<br>`Apple Store order W123456789` | `W123456789` | `transaction:apple:w123456789` | Uppercase `W` prefix followed by 9-10 digits. |
| **Nike** | `C0123456789`<br>`c0123456789`<br>`C-0123456789`<br>`Nike Order: C0123456789` | `C0123456789` | `transaction:nike:c0123456789` | Uppercase `C0` prefix; normalize hyphenated `C-` to `C0`. |
| **Jiffy** | `2541442349`<br>`Order #2541442349`<br>`Jacob's Cart #50 (Order #2541442349)` | `2541442349` | `transaction:jiffy:2541442349` | Disambiguate Cart ID (`#50`) from Order ID (`#2541442349`). Map `Jiffy Shirts` / `Jiffy Transfers` to `jiffy`. |
| **HelloFresh** | `HF-12345678`<br>`hf-12345678`<br>`Order # HF-12345678` | `HF-12345678` | `transaction:hellofresh:hf-12345678` | Uppercase prefix with hyphens. Set `isPerishable: true`. Also support Green Chef (`GC-`), Blue Apron (`BA-`), Factor (`FACT-`). |

#### Required Test Cases for Order Normalization:
1. `test('Walmart order number canonicalization handles 15-digit and 16-digit unhyphenated formats')`
2. `test('Amazon order number canonicalization formats 17 unformatted digits into 3-7-7')`
3. `test('Apple web order numbers standardize lowercase w-prefix to uppercase W')`
4. `test('Nike order numbers standardize C0 and C- prefixes to canonical C0-prefix')`
5. `test('Target order numbers cleanly extract standalone 10-14 digit IDs')`
6. `test('Jiffy order extractor isolates Order ID from Cart ID')`
7. `test('HelloFresh and meal kit order numbers normalize prefixes and flag isPerishable: true')`
8. `test('URL parameter extraction correctly pulls orderId, order_id, orderNumber from tracking links')`

---

### 3.2 Multi-Carrier Courier Tracking & Composite Keying Test Suite

| Carrier | Tracking Number Formats | Expected Carrier Code | Standalone Composite Key | Integrated Composite Key |
|---|---|---|---|---|
| **UPS** | `1Z9999999999999999`<br>`1z9999999999999999`<br>`1Z 999 999 99 9999 999 9` | `'ups'` | `courier:ups:1z9999999999999999` | `transaction:${vendor}:${orderId}` (with `carrier: 'ups'`, `trackingNumber: '1Z999...'`) |
| **FedEx** | `123456789012` (12 digits)<br>`123456789012345` (15 digits)<br>`9611019012345678901234` (20-22 digits) | `'fedex'` | `courier:fedex:123456789012` | `transaction:${vendor}:${orderId}` (with `carrier: 'fedex'`, `trackingNumber: '12345...'`) |
| **USPS** | `9400100000000000000000` (22 digits)<br>`9205500000000000000000` (22 digits)<br>`EA123456789US` (13 char intl) | `'usps'` | `courier:usps:9400100000000000000000` | `transaction:${vendor}:${orderId}` (with `carrier: 'usps'`, `trackingNumber: '9400...'`) |
| **DHL** | `1234567890` (10 digits)<br>`GM1234567890123456` (DHL eCommerce) | `'dhl'` | `courier:dhl:1234567890` | `transaction:${vendor}:${orderId}` (with `carrier: 'dhl'`, `trackingNumber: '12345...'`) |

#### Required Test Cases for Courier Tracking & Composite Keying:
1. `test('UPS 1Z tracking numbers normalize to uppercase without whitespace')`
2. `test('FedEx 12, 15, and 20-22 digit tracking numbers are accurately identified with carrier context')`
3. `test('USPS 20-24 digit tracking numbers starting with 92/93/94/95 are detected without false positives')`
4. `test('DHL 10-digit Express and GM eCommerce tracking numbers are normalized')`
5. `test('Courier tracking numbers inside merchant orders attach carrier and tracking metadata to primary order thread key')`
6. `test('Standalone courier delivery notifications without order numbers generate standardized courier composite thread keys')`
7. `test('Two emails referencing same tracking number (one merchant, one direct carrier) consolidate into 1 canonical entity')`

---

### 3.3 Tense-Aware Lifecycle Stage Resolution Test Suite

```
[confirmed] ──> [payment] ──> [shipped] ──> [out_for_delivery] ──> [delivered]
    │                                                                   ▲
    └─────────────── (Problem / Cancellation) ──> [problem] ────────────┘
```

| Lifecycle Stage | Stepper Rank | Trigger Phrases / Patterns | Anti-Regression / Exception Rules |
|---|---|---|---|
| `confirmed` | 0 | "Thanks for your order", "Order confirmation", "Order placed", "We're preparing your order", "Being prepared", "Last minute to add items", "Last call to edit" | "Being prepared" email for same order keeps/re-affirms stage `confirmed`. |
| `payment` | 0 | "Temporary hold is $...", "Final charge for your order", "Receipt for payment", "Order total charged" | Holds/charges attach cost metadata to existing order without resetting stage if already `shipped`. |
| `shipped` | 1 | "Your order has shipped", "Package on the way", "In transit", "Dispatched", "Carrier tracking", "Shipment for" | Advances stage to `shipped`; never regresses to `confirmed` or `payment`. |
| `out_for_delivery` | 2 | "Out for delivery", "Driver is on the way", "Driver heading your way", "Arriving today by 3:44pm" | Triggered only on day of delivery with active driver dispatch. "InHome delivery" alone is product name, NOT out for delivery. |
| `delivered` | 3 | "Your package has been delivered", "Delivered to front porch", "Delivered at 2:15pm", "Proof of delivery" | Must strictly be past tense. Never triggered by future delivery notices. |
| `problem` | -1 | "Delivery exception", "Delivery failed", "Package damaged in transit", "Order cancelled", "Unable to deliver" | Overrides all previous stages. Must NOT be triggered by passive return/claim policies. |

#### Required Test Cases for Lifecycle Progression:
1. `test('Lifecycle progression follows monotonic ordering: confirmed -> payment -> shipped -> out_for_delivery -> delivered')`
2. `test('"Being prepared" and "Last minute to add items" resolve to stage confirmed (Step 0) and arriving today')`
3. `test('Payment pricing hold notifications attach cost to order without resetting stage')`
4. `test('Carrier shipment update advances stage from confirmed to shipped')`
5. `test('Active driver dispatch on delivery day advances stage to out_for_delivery')`
6. `test('Explicit past-tense delivery notice advances stage to delivered')`
7. `test('Late-arriving payment receipt does NOT regress delivered or shipped order backwards')`
8. `test('Cancellation or delivery exception triggers problem stage (Step -1)')`

---

### 3.4 Future Arrival Date Guardrails Test Suite

| Test Scenario | Email Snippet / Input | Evaluated Date | Expected Stage | Expected In-Transit | Expected Delivered | Expected Scheduled Later |
|---|---|---|---|---|---|---|
| **Future Order Confirmation** | "Your Jiffy order is arriving on Monday, Aug 24" | Saturday, Aug 22 | `confirmed` | `true` | `false` | `true` |
| **Future Shipping Update** | "Shipped! Estimated delivery: Wednesday, Aug 26" | Saturday, Aug 22 | `shipped` | `true` | `false` | `true` |
| **Ambiguous Future Phrase** | "Delivery confirmed for Thursday, Aug 27" | Saturday, Aug 22 | `confirmed` | `true` | `false` | `true` |
| **Future Delivery Window** | "Will be delivered on Monday between 2pm - 6pm" | Saturday, Aug 22 | `confirmed` | `true` | `false` | `true` |
| **Multi-Stage Progression** | Confirmation on Sat Aug 22 -> Shipped on Sun Aug 23 -> Arriving Mon Aug 24 | Sunday, Aug 23 | `shipped` | `true` | `false` | `true` |

#### Required Test Cases for Future Arrival Guardrails:
1. `test('Future arrival dates (targetDate > today) never resolve to delivered, regardless of wording')`
2. `test('Future deliveries evaluate isItemDelivered = false and isItemInTransit = true')`
3. `test('Future deliveries evaluate isItemScheduledLater = true and isItemArrivingToday = false')`
4. `test('Phrases "will be delivered", "scheduled to be delivered", "estimated delivery" never trigger delivered')`
5. `test('Multi-email progression across multiple days retains future arrival guardrail until delivery date arrives')`

---

### 3.5 Past Courier Auto-Resolution Test Suite

| Test Scenario | Item State / Date | Evaluation Date | Expected Effective Stage | Expected ETA Display | Auto-Resolution Rationale |
|---|---|---|---|---|---|
| **Same-Day Courier from Yesterday** | `out_for_delivery` on 2026-08-19 | 2026-08-20 (Next Day) | `delivered` | "Delivered yesterday" | Same-day courier driver dispatch completed on past day with no reported issue. |
| **Same-Day Courier from 3 Days Ago** | `out_for_delivery` on 2026-08-17 | 2026-08-20 | `delivered` | "Delivered Aug 17" | Auto-resolved past same-day delivery. |
| **Active Dispatch Today** | `out_for_delivery` on 2026-08-20 | 2026-08-20 (Today) | `out_for_delivery` | "Expected by 3:44pm today" | Active today; must remain `out_for_delivery`. |
| **Cross-Country Shipped Yesterday** | `shipped` on 2026-08-19 (Due Aug 24) | 2026-08-20 | `shipped` | "Mon, Aug 24" | Multi-day transit; NEVER auto-resolve `shipped` stage. |
| **Order Placed Yesterday** | `confirmed` on 2026-08-19 | 2026-08-20 | `confirmed` | "Tomorrow" or scheduled date | Order in preparation; NEVER auto-resolve `confirmed` stage. |
| **Delivery Exception Yesterday** | `problem` on 2026-08-19 | 2026-08-20 | `problem` | "Delivery exception" | Blocker present; NEVER auto-resolve `problem` stage. |

#### Required Test Cases for Past Courier Auto-Resolution:
1. `test('Past out_for_delivery records automatically resolve to delivered on subsequent calendar days')`
2. `test('Past out_for_delivery from yesterday formats ETA as "Delivered yesterday"')`
3. `test('Past out_for_delivery from multiple days ago formats ETA as "Delivered MMM d"')`
4. `test('Active out_for_delivery on the current calendar day remains out_for_delivery')`
5. `test('Orders in confirmed, payment, or shipped stages NEVER auto-resolve based solely on elapsed time')`
6. `test('Orders with problem stage NEVER auto-resolve to delivered')`

---

### 3.6 0% Executive Action Queue Leakage & Policy Disclaimer Test Suite

| Ingestion Email Type | Raw Content | Agency Level | Feed Destination | Policy Disclaimer | Action Queue Count | Calendar Suggestion Count |
|---|---|---|---|---|---|---|
| **E-Commerce Shipping with Claim Disclaimer** | Jiffy order shipped with "Claims for missing, wrong, or damaged items must be made within 3 days (by Aug 27)" | `0` | `deliveryTransitItems` | "Claims for missing, wrong, or damaged items must be made within 3 days of final delivery (by Thursday, Aug 27)." | `0` | `0` |
| **School Spirit Wear with Return Window** | Bak MSOA shirt shipped with "Return window is 14 days" | `0` | `deliveryTransitItems` | "Return window is 14 days." | `0` | `0` |
| **Walmart Grocery Delivery Notice** | InHome delivery scheduled today between 2pm-6pm | `0` | `deliveryTransitItems` | `null` | `0` | `0` |
| **Walmart Payment Hold** | Temporary hold of $138.65 | `0` | `deliveryTransitItems` | `null` | `0` | `0` |
| **School Form Requiring Signature (High Agency)** | Bak Middle School Yellow Folder waiver due Friday | `2` | `actionableItems` | `null` | `1` | `0` |
| **Doctor Appointment (High Agency / Calendar)** | Pediatric checkup Tuesday at 3pm | `2` | `actionableItems` / Calendar | `null` | `1` | `1` |

#### Required Test Cases for 0% Leakage:
1. `test('splitActionableAndTransitItems partitions all agency_level === 0 items into deliveryTransitItems with 0 actionableItems leakage')`
2. `test('Order return window disclaimers extract into policyDisclaimer without triggering deadline action items')`
3. `test('Order missing/damage claim footnotes extract into policyDisclaimer without triggering problem action items')`
4. `test('detectSuggestedEvent returns null for grocery delivery windows and parcel tracking emails')`
5. `test('detectSuggestedActionBundle returns null for shipping updates and pricing hold notices')`
6. `test('True high-agency emails (forms, waivers, bills) route to actionableItems with agency_level >= 1')`

---

## 4. Code Layout & Architecture Unification Strategy

### 4.1 Current Architecture & Code Duplication
Currently, order and tracking resolution logic exists in two distinct places:
1. **Frontend**: `src/utils/vendorTransactions.ts` (741 lines) contains the most up-to-date implementation of order canonicalization, date resolution, and transit consolidation.
2. **Edge Function**: `supabase/functions/scan-gmail-inbox/index.ts` contains duplicated helper functions (`transactionIdentity()`, `canonicalizeTransactionOrderId()`, `normalizeTransactionKeyPart()`, `transactionDescriptor()`) defined locally inside the Edge Function.

### 4.2 Target Shared Architecture for Milestone 3
To eliminate duplication and provide single-source-of-truth canonical identity resolution across both client and edge functions:
1. Create `supabase/functions/_shared/canonical-order-resolver.mjs` exporting:
   - `resolveCanonicalEntity(params: CanonicalEntityInput): CanonicalEntityResult`
   - `canonicalizeOrderId(vendor: string, rawId: string): string`
   - `extractOrderId(text: string): string | null`
   - `extractCourierTracking(text: string): { carrier: 'ups' | 'fedex' | 'usps' | 'dhl' | null, trackingNumber: string | null }`
   - `resolveLifecycleStage(params: StageResolutionInput): DeliveryTransitStage`
   - `resolveEffectiveStage(stage: DeliveryTransitStage, deliveryDate: Date | null, now?: Date): DeliveryTransitStage`
   - `extractPolicyDisclaimer(text: string): string | null`
   - `buildCompositeThreadKey(params: CompositeKeyParams): string`
2. Refactor `supabase/functions/scan-gmail-inbox/index.ts` to import `canonical-order-resolver.mjs`.
3. Refactor `src/utils/vendorTransactions.ts` to leverage the unified rules.
4. Create `tests/canonical-order-resolver.test.mjs` to comprehensively unit test `_shared/canonical-order-resolver.mjs` using `node:test`.

---

## 5. Missing Test Fixtures, Gap Analysis & Existing Test Health

### 5.1 Test Suite Health Summary
- Total tests executed by `npm test`: **1,698**
- Passing: **1,698** (100%)
- Failing: **0**
- Skipped: **0**
- Execution Duration: **7.85 seconds**

### 5.2 Missing Test Fixtures & Files for Milestone 3
1. `tests/canonical-order-resolver.test.mjs`: Needs to be created.
2. `supabase/functions/_shared/canonical-order-resolver.mjs`: Needs to be created.
3. `tests/fixtures/email-benchmark.json`: Missing directory `tests/fixtures/`; holdout benchmark dataset is planned for Milestone 2. Milestone 3 tests should be self-contained unit tests without hard dependencies on external network or benchmark files.

---

## 6. Recommended Test Implementation Blueprint

Below is the blueprint for `tests/canonical-order-resolver.test.mjs`:

```javascript
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canonicalizeOrderId,
  extractCourierTracking,
  extractOrderId,
  extractPolicyDisclaimer,
  resolveCanonicalEntity,
  resolveEffectiveStage,
  resolveLifecycleStage,
  buildCompositeThreadKey,
} from '../supabase/functions/_shared/canonical-order-resolver.mjs'

test('canonical-order-resolver: multi-vendor order canonicalization', () => {
  // Walmart
  assert.equal(canonicalizeOrderId('Walmart', '200015480824348'), '2000154-80824348')
  assert.equal(canonicalizeOrderId('Walmart', '2000154-80824348'), '2000154-80824348')
  // Amazon
  assert.equal(canonicalizeOrderId('Amazon', '11284729104829103'), '112-8472910-4829103')
  assert.equal(canonicalizeOrderId('Amazon', '112-8472910-4829103'), '112-8472910-4829103')
  // Apple
  assert.equal(canonicalizeOrderId('Apple', 'w123456789'), 'W123456789')
  // Nike
  assert.equal(canonicalizeOrderId('Nike', 'c0123456789'), 'C0123456789')
  assert.equal(canonicalizeOrderId('Nike', 'C-0123456789'), 'C0123456789')
  // Jiffy
  assert.equal(canonicalizeOrderId('Jiffy.com', '2541442349'), '2541442349')
  // HelloFresh
  assert.equal(canonicalizeOrderId('HelloFresh', 'hf-98765432'), 'HF-98765432')
})

test('canonical-order-resolver: courier tracking number and carrier extraction', () => {
  // UPS
  assert.deepEqual(extractCourierTracking('UPS tracking # 1Z9999999999999999'), {
    carrier: 'ups',
    trackingNumber: '1Z9999999999999999',
  })
  // FedEx
  assert.deepEqual(extractCourierTracking('FedEx tracking 123456789012'), {
    carrier: 'fedex',
    trackingNumber: '123456789012',
  })
  // USPS
  assert.deepEqual(extractCourierTracking('USPS tracking 9400100000000000000000'), {
    carrier: 'usps',
    trackingNumber: '9400100000000000000000',
  })
  // DHL
  assert.deepEqual(extractCourierTracking('DHL Express 1234567890'), {
    carrier: 'dhl',
    trackingNumber: '1234567890',
  })
})

test('canonical-order-resolver: composite thread key generation', () => {
  assert.equal(
    buildCompositeThreadKey({ vendor: 'Walmart', orderId: '2000154-80824348' }),
    'transaction:walmart:2000154-80824348'
  )
  assert.equal(
    buildCompositeThreadKey({ carrier: 'ups', trackingNumber: '1Z9999999999999999' }),
    'courier:ups:1z9999999999999999'
  )
})

test('canonical-order-resolver: future arrival guardrails and past courier auto-resolution', () => {
  const saturday = new Date('2026-08-22T10:00:00-04:00')
  const monday = new Date('2026-08-24T18:00:00-04:00')
  const wednesdayPast = new Date('2026-08-19T18:00:00-04:00')

  // Future arrival stays confirmed/shipped
  assert.equal(resolveEffectiveStage('delivered', monday, saturday), 'confirmed')
  assert.equal(resolveEffectiveStage('shipped', monday, saturday), 'shipped')

  // Past same-day dispatch auto-resolves to delivered
  assert.equal(resolveEffectiveStage('out_for_delivery', wednesdayPast, saturday), 'delivered')
  // Past multi-day shipment does NOT auto-resolve
  assert.equal(resolveEffectiveStage('shipped', wednesdayPast, saturday), 'shipped')
})

test('canonical-order-resolver: policy disclaimer extraction and 0 agency level', () => {
  const result = resolveCanonicalEntity({
    vendor: 'Jiffy.com',
    text: 'Your order #2541442349 has shipped. Claims for missing, wrong, or damaged items must be made within 3 days of final delivery (by Thursday, Aug 27).',
    receivedAt: '2026-08-22T15:33:00Z',
    deliveryDate: '2026-08-24T18:00:00Z',
    now: new Date('2026-08-22T18:00:00-04:00'),
  })

  assert.equal(result.vendorKey, 'jiffy')
  assert.equal(result.canonicalOrderId, '2541442349')
  assert.equal(result.compositeThreadKey, 'transaction:jiffy:2541442349')
  assert.equal(result.effectiveStage, 'shipped')
  assert.equal(result.agencyLevel, 0)
  assert.match(result.policyDisclaimer || '', /claims for missing/i)
})
```

---

## 7. 5-Component Handoff Protocol

### 1. Observation
- `package.json` line 9 defines test script `"test": "node --test tests/*.test.mjs"`.
- Running `npm test` executed 1,698 unit and integration tests across 115 test files with 0 failures in 7.85s.
- `tests/vendor-transaction-producer.test.mjs` (586 lines) tests 12 scenarios covering Walmart, Amazon, Apple, Nike, Jiffy order resolution, future arrival guardrails, and feed splitting.
- `tests/canonical-order-resolver.test.mjs` does not exist in `tests/`.
- `supabase/functions/_shared/canonical-order-resolver.mjs` does not exist in `supabase/functions/_shared/`.
- `supabase/functions/scan-gmail-inbox/index.ts` lines 564–670 contains an embedded, duplicated implementation of `transactionIdentity` and `canonicalizeTransactionOrderId`.
- `src/utils/needsYouFeed.ts` line 83 checks `item.agency_level === 0 || isDeliveryTransitItem(item)` for partitioning into `deliveryTransitItems`.

### 2. Logic Chain
1. Milestone 3 requires a deterministic canonical order resolver that operates seamlessly across client (`src/utils/vendorTransactions.ts`) and edge functions (`supabase/functions/scan-gmail-inbox/index.ts`).
2. Duplicating parsing logic between client and edge function creates drift and violates single-source-of-truth architecture.
3. Extracting the core normalization, courier tracking extraction, tense-aware lifecycle progression, future arrival guardrails, and policy disclaimer extraction into `supabase/functions/_shared/canonical-order-resolver.mjs` allows both backend edge functions and client utilities to share the exact same canonical resolution rules.
4. Comprehensive unit testing of this shared module via `tests/canonical-order-resolver.test.mjs` alongside expanded tests in `tests/vendor-transaction-producer.test.mjs` will guarantee 100% test coverage and preserve the 1,698+ zero-regression baseline.

### 3. Caveats
- Benchmark fixtures (`tests/fixtures/email-benchmark.json`) are scoped to Milestone 2 and do not yet exist on disk; Milestone 3 unit tests must remain self-contained with mock/in-memory test data fixtures.
- Playwright visual tests require browser binaries and are executed separately from the fast unit regression harness.

### 4. Conclusion
The repository has a high-speed, robust native test runner (`node:test`). To fulfill Milestone 3:
1. Implement `supabase/functions/_shared/canonical-order-resolver.mjs` conforming to `CanonicalEntityResult` interface.
2. Implement comprehensive unit test suite in `tests/canonical-order-resolver.test.mjs`.
3. Integrate `canonical-order-resolver.mjs` into `supabase/functions/scan-gmail-inbox/index.ts` and `src/utils/vendorTransactions.ts`.
4. Run `npm test` to verify all new and existing tests pass with 0 regressions.

### 5. Verification Method
- **Test execution**: Run `npm test` from project root (`/Users/taboj/casa-tabor`). Expected: 100% pass across all tests.
- **Specific test inspection**:
  - `node --test tests/vendor-transaction-producer.test.mjs`
  - `node --test tests/canonical-order-resolver.test.mjs` (upon implementation)
- **Type safety verification**: Run `npm run build` to verify TypeScript type checking across all modified modules.
