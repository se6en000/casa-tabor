# Adversarial Evaluation Report: Milestone 3 — Deterministic Entity & Canonical Order Resolver

**Challenger**: Challenger 2 (Empirical Challenger)  
**Milestone**: Milestone 3 (Deterministic Entity & Canonical Order Resolver)  
**Explicit Verdict**: `REQUEST_CHANGES`

---

## 1. Observation

Direct empirical observations from test runs, source inspections, and stress harnesses:

1. **Out-of-Order Cost Overwriting in `mergeDeliveryTransitItem`**:
   - In `/Users/taboj/casa-tabor/src/utils/vendorTransactions.ts:739`:
     ```typescript
     const mergedCost = incoming.cost || existing.cost || null
     ```
   - When an older update (e.g. initial order confirmation with preliminary estimate `$120.00`) arrives or is processed after a newer update (e.g. final delivery receipt with actual charged total `$138.65`), `incoming.cost` blindly overrides `existing.cost`, causing the newer price to be overwritten by the older one.
   - Tested empirically in `tests/adversarial-canonical-order-resolver.test.mjs` (Permutation #1 of the 120-permutation stress test):
     ```
     AssertionError [ERR_ASSERTION]: Permutation #1 must preserve final cost $138.65
     + actual: '$120.00'
     - expected: '$138.65'
     ```

2. **`isPerishableDelivery` Property Check Inconsistency**:
   - In `/Users/taboj/casa-tabor/src/utils/vendorTransactions.ts:886`:
     ```typescript
     export function isPerishableDelivery(item: PrepItem | string): boolean {
       const text = (typeof item === 'string' ? item : `${item.event_title ?? ''} ${item.description ?? ''} ${item.attention_vendor ?? ''}`).toLowerCase()
     ```
   - In contrast, `/Users/taboj/casa-tabor/supabase/functions/_shared/canonical-order-resolver.mjs:577` checks:
     ```javascript
     const title = textOrItem.event_title || textOrItem.title || ''
     const vendor = textOrItem.vendor || textOrItem.attention_vendor || ''
     ```
   - When payloads formatted with `title` or `vendor` (e.g., `{ title: 'Thanks for your InHome delivery order, Jacob', vendor: 'Walmart' }`) are passed to `clientResolveCanonicalEntity`, `vendorTransactions.ts` evaluated `${undefined} ${undefined} ${undefined}` and returned `isPerishable: false`, while `canonical-order-resolver.mjs` returned `isPerishable: true`.

3. **`splitActionableAndTransitItems` Noise Leakage into Inbound Manifest**:
   - In `/Users/taboj/casa-tabor/src/utils/needsYouFeed.ts:83`:
     ```typescript
     for (const item of items) {
       if (item.agency_level === 0 || isDeliveryTransitItem(item)) {
         rawTransitItems.push(buildDeliveryTransitItem(item))
       } else {
         actionableItems.push(item)
       }
     }
     ```
   - Any item with `agency_level: 0` (including promotional marketing emails like `BM-NOI-01` through `BM-NOI-05`) is converted by `buildDeliveryTransitItem` into a `deliveryTransitItem` with thread key `delivery:williams-sonoma:...` or `transaction:parcel:...` instead of being skipped.
   - Result: 5 test failures in `tests/e2e-email-intelligence-tiers.test.mjs` (`T5.BM-NOI-01` through `T5.BM-NOI-05`).

4. **Verified Core Strengths (Passed All Stress Tests)**:
   - **Multi-Vendor Canonicalization**: Walmart (hyphenated 7-8), Amazon (3-7-7 and D01 digital), Apple (W-prefix), Nike (C0/C- prefix), Target (10-14 digits), Jiffy (Order # extraction from Cart strings), and HelloFresh (HF-, GC-, BA-, FACT-) normalize deterministically across all variations.
   - **Lifecycle Monotonicity & In-Preparation Lock**: "Being prepared", "last minute to add items", and "last call to edit" successfully hold the transaction at stage `confirmed` (Step 0) without premature advance.
   - **Future Arrival Date Guardrails**: Deliveries on future calendar days strictly resist erroneous `delivered` transitions.
   - **Past Courier Auto-Resolution**: Same-day courier dispatches on past calendar days properly auto-resolve to `delivered` while multi-day freight (`shipped`, `confirmed`) remains active.
   - **0% Action Queue Leakage**: Passive return and claim policy footnotes ("Claims for missing, wrong, or damaged items must be made within 3 days") are extracted into `policyDisclaimer` without triggering false `problem` exceptions or actionable task items.

---

## 2. Logic Chain

1. **Lifecycle & Field Merging Precedence**:
   - In a distributed email ingestion system, delivery updates may arrive out of order (e.g. delivered receipt processed before delayed shipping confirmation).
   - In `mergeDeliveryTransitItem`, stage progression already employs monotonicity ranking (`incomingRank > existingRank`).
   - However, metadata fields (`cost` and `policyDisclaimer`) must similarly respect temporal precedence based on `isLatestIncoming = new Date(incoming.occurredAt).getTime() >= new Date(existing.occurredAt).getTime()`.
   - When `isLatestIncoming` is false, `existing.cost` must take precedence over `incoming.cost`.

2. **Contract Parity Between Client and Shared Modules**:
   - `CanonicalEntityResult` is used on both the server edge functions and the client.
   - Discrepancies between `canonical-order-resolver.mjs` and `vendorTransactions.ts` in property handling (`title`/`event_title` and `vendor`/`attention_vendor`) break cross-tier consistency for objects constructed in different UI and background contexts.

3. **Inbound Manifest vs Promotional Filtering**:
   - In `splitActionableAndTransitItems`, the condition `item.agency_level === 0 || isDeliveryTransitItem(item)` incorrectly conflates "passive/non-actionable" with "inbound delivery".
   - Non-actionable items (`agency_level === 0`) that are NOT deliveries (e.g., promotional newsletters, estate advisories) must not be pushed to `rawTransitItems`.
   - Only items where `isDeliveryTransitItem(item)` is true should populate `deliveryTransitItems`.

---

## 3. Caveats

- As an empirical challenger operating under review-only constraints, implementation source files (`vendorTransactions.ts`, `needsYouFeed.ts`) were NOT modified by Challenger 2.
- The 12-suite adversarial test file `tests/adversarial-canonical-order-resolver.test.mjs` has been committed to `tests/` for automated verification.

---

## 4. Conclusion & Required Changes

**Verdict: `REQUEST_CHANGES`**

### Required Action Items for Worker / Remediation:
1. **Fix chronological cost and policy merging in `mergeDeliveryTransitItem` (`src/utils/vendorTransactions.ts:739,742`)**:
   ```typescript
   const isLatestIncoming = new Date(incoming.occurredAt).getTime() >= new Date(existing.occurredAt).getTime()
   const mergedCost = isLatestIncoming
     ? (incoming.cost || existing.cost || null)
     : (existing.cost || incoming.cost || null)
   const mergedPolicy = isLatestIncoming
     ? (incoming.policyDisclaimer || existing.policyDisclaimer || null)
     : (existing.policyDisclaimer || incoming.policyDisclaimer || null)
   ```
2. **Harmonize `isPerishableDelivery` in `src/utils/vendorTransactions.ts:886`**:
   ```typescript
   export function isPerishableDelivery(item: PrepItem | Partial<PrepItem> | { title?: string; vendor?: string; description?: string } | string): boolean {
     const text = (typeof item === 'string' ? item : `${(item as any).title ?? ''} ${(item as any).event_title ?? ''} ${(item as any).description ?? ''} ${(item as any).vendor ?? ''} ${(item as any).attention_vendor ?? ''}`).toLowerCase()
   ```
3. **Fix feed partitioning in `src/utils/needsYouFeed.ts:83`**:
   ```typescript
   for (const item of items) {
     if (isDeliveryTransitItem(item)) {
       rawTransitItems.push(buildDeliveryTransitItem(item))
     } else if (item.agency_level !== 0) {
       actionableItems.push(item)
     }
   }
   ```

---

## 5. Verification Method

To independently verify these findings and check all test suites:

```bash
# 1. Run Challenger 2 adversarial test suite
node --test tests/adversarial-canonical-order-resolver.test.mjs

# 2. Run Milestone 3 canonical order resolver unit tests
node --test tests/canonical-order-resolver.test.mjs

# 3. Run vendor transaction producer unit tests
node --test tests/vendor-transaction-producer.test.mjs

# 4. Run full test suite and verify 0 failures after remediation
npm test

# 5. Run full production build and type audit
npm run build
```
