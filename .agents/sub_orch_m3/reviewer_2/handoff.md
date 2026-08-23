# Handoff Report: Reviewer 2 — Milestone 3: Deterministic Entity & Canonical Order Resolver

## 1. Observation

### Source Implementations & Integration Reviewed
1. **Shared Pure ES Module**: `/Users/taboj/casa-tabor/supabase/functions/_shared/canonical-order-resolver.mjs` (760 lines)
   - Verified 0 external dependencies (runs natively in Deno Edge Functions, Node.js test runner, and browser).
   - Conforms strictly to `CanonicalEntityResult` interface in `PROJECT.md §Interface Contracts 1`.
   - Verified exports: `VENDOR_ALIASES`, `normalizeKeyPart`, `canonicalizeOrderId`, `canonicalizeTrackingNumber`, `detectCarrierAndTracking`, `detectVendor`, `detectVendorAndOrder`, `buildCompositeThreadKey`, `resolveTransactionStage`, `resolveEffectiveStage`, `extractPolicyDisclaimer`, `isPerishableDelivery`, `formatDeliveryEta`, `resolveCanonicalEntity`.
2. **Edge Function Integration**: `/Users/taboj/casa-tabor/supabase/functions/scan-gmail-inbox/index.ts` lines 26–33, 572–623, 680–737
   - Imports from `../_shared/canonical-order-resolver.mjs`.
   - Delegates entity detection, canonical order ID formatting, courier tracking detection, composite thread keying, and stage resolution to shared module.
   - Implements monotonic state progression and idempotent updates using `attention_thread_key`.
   - Sets `agency_level: 0` for all delivery/transaction notifications.
3. **Client Utilities & Action Queue Partitioning**:
   - `/Users/taboj/casa-tabor/src/utils/vendorTransactions.ts` (1,212 lines): Implements identical multi-vendor/carrier canonicalization rules, stage resolution, future arrival guardrails, and item consolidation.
   - `/Users/taboj/casa-tabor/src/utils/needsYouFeed.ts` lines 74–94 (`splitActionableAndTransitItems`): Guarantees that items with `agency_level === 0` or matching `isDeliveryTransitItem` route strictly to `deliveryTransitItems`, achieving 0% false leakage into the Executive Action Queue (`actionableItems`).
4. **Type Contract Definition**: `/Users/taboj/casa-tabor/src/types/index.ts` lines 370–387
   - Fully declared `CanonicalEntityResult` interface with all 16 runtime fields.

### Verification Commands & Results (Executed Independently)
- `node --test tests/canonical-order-resolver.test.mjs`:
  ```
  ✔ canonical-order-resolver: multi-vendor order canonicalization (1.046292ms)
  ✔ canonical-order-resolver: courier tracking normalization and URL generation (0.47425ms)
  ✔ canonical-order-resolver: vendor and order detection from unstructured text (0.552416ms)
  ✔ canonical-order-resolver: composite thread key generation (0.112958ms)
  ✔ canonical-order-resolver: lifecycle stage resolution and in-preparation lock (1.326292ms)
  ✔ canonical-order-resolver: future arrival date guardrail (1.693083ms)
  ✔ canonical-order-resolver: past courier auto-resolution (0.098666ms)
  ✔ canonical-order-resolver: dynamic ETA formatting (0.130583ms)
  ✔ canonical-order-resolver: policy disclaimer extraction and 0 agency level (0.284958ms)
  ✔ canonical-order-resolver: perishable grocery and meal kit identification (0.114417ms)
  ✔ canonical-order-resolver: full resolveCanonicalEntity contract conformance (1.070834ms)
  ℹ tests 11, pass 11, fail 0 (duration_ms 72.411875)
  ```
- `node --test tests/vendor-transaction-producer.test.mjs`:
  ```
  ✔ Gmail action extraction stores reusable vendor transaction identity (0.506875ms)
  ✔ migration adds indexed transaction identity and backfills current Walmart rows (0.07425ms)
  ✔ Home and Action Center label grouped transactions as updates (0.074791ms)
  ✔ vendor transaction identity clusters multiple Walmart emails into a single delivery key on the same date (513.984375ms)
  ✔ real Supabase records with Walmart+ InHome compound keys merge seamlessly into 1 Hero item (1.45025ms)
  ✔ past out-for-delivery records automatically transition to delivered when evaluated on next day (0.452333ms)
  ✔ Jiffy order confirmation with future arrival date (Monday Aug 24) stays In Transit / Scheduled Later and NOT delivered on Saturday Aug 22 (0.380791ms)
  ✔ future-tense delivery strings never trigger delivered stage (0.102584ms)
  ✔ Jiffy order shipment with claims policy disclaimer consolidates into delivery transit and creates 0 actionable items and 0 calendar suggestions (5.076083ms)
  ✔ compound school spirit order cleanly splits into 1 delivery in Inbound Manifest and 1 calendar event with 0 Action Queue leakage (0.24ms)
  ✔ Walmart InHome: Thanks for order + Last minute to add items merge into 1 order, stage confirmed (Being Prepared), and arriving today (0.237375ms)
  ✔ multi-vendor order number canonicalization accurately normalizes Walmart, Amazon, Target, Apple, Nike, Jiffy, and HelloFresh (0.330208ms)
  ✔ multi-carrier courier tracking produces standardized composite keys including DHL (0.273125ms)
  ℹ tests 13, pass 13, fail 0 (duration_ms 595.3715)
  ```
- `npm test`:
  ```
  ℹ tests 1846, suites 21, pass 1846, fail 0 (duration_ms 5772.586667)
  ```
- `npm run build`:
  ```
  ✓ built in 1.34s (0 TypeScript errors, 0 lint regressions)
  ```

---

## 2. Logic Chain

1. **Deterministic Multi-Vendor Normalization**:
   - Observations 1 & 3: `canonicalizeOrderId` accurately parses formatted and unformatted variations across major merchants:
     - Walmart: Converts 15/16 digit raw strings (`200015480824348`, `WM-2000154-80824348`) to hyphenated `2000154-80824348`.
     - Amazon: Normalizes 17-digit raw strings (`11284729104829103`) to `112-8472910-4829103` and preserves `D01-...` digital order IDs.
     - Apple: Formats `w123456789` -> `W123456789`.
     - Nike: Formats `c0123456789` -> `C0123456789` and `c-0123456789` -> `C-0123456789`.
     - Target: Extracts 10-14 digit standalone order numbers.
     - Jiffy: Extracts 10-digit order ID from compound cart strings (`Jacob's Cart #50 (Order #2541442349)` -> `2541442349`).
     - HelloFresh & Meal Kits: Identifies box references (`hf-`, `gc-`, `ba-`, `fact-`).
   - Inference: Guarantees deterministic order identity across disparate merchant email templates.

2. **Multi-Carrier Courier Tracking & Composite Keying**:
   - Observation 1: `detectCarrierAndTracking` recognizes UPS (1Z / Mail Innovations), FedEx (12/14/15/20-22 digits), USPS (20-24 digits / UPU S10), and DHL (10-11 digits / eCommerce GM prefixes), generating validated carrier URLs.
   - Observation 1 & 2: `buildCompositeThreadKey` enforces strict hierarchy:
     1. `transaction:${vendorKey}:${canonicalOrderId}`
     2. `courier:${carrier}:${trackingNumber}`
     3. `transaction:${vendorKey}:items:${descriptor}`
     4. `delivery:${vendorKey}:${dateKey}`
     5. `transaction:${vendorKey}:message:${sourceRef}`
   - Inference: Disparate status emails for the same transaction merge into a single lifecycle entity regardless of arrival order.

3. **Tense-Aware Lifecycle Stage Progression & Guardrails**:
   - Observation 1 & 2: `resolveTransactionStage` maps text patterns to 6 stages: `confirmed` (0), `payment` (0), `shipped` (1), `out_for_delivery` (2), `delivered` (3), `problem` (-1).
   - "Being prepared", "last minute to add items", and "last call to edit" lock the transaction stage into `confirmed` (step 0).
   - Observation 1: `resolveEffectiveStage` enforces two calendar guardrails:
     - **Future Arrival Guardrail**: If `deliveryDate > now`, orders never resolve to `delivered` (downgrades to `confirmed`/`shipped`).
     - **Past Courier Auto-Resolution**: If `deliveryDate < now` and `stage === 'out_for_delivery'`, auto-resolves to `delivered`. Multi-day freight (`shipped`, `confirmed`, `payment`) remains active and does not prematurely auto-resolve.

4. **0% Executive Action Queue Leakage**:
   - Observation 2 & 3: `scan-gmail-inbox/index.ts` sets `agency_level: 0` for all delivery/transaction items.
   - `extractPolicyDisclaimer` preserves return/claim policy disclaimers (`"Claims for missing items must be made within 3 days..."`) in metadata without triggering `problem` or action items.
   - `splitActionableAndTransitItems` in `needsYouFeed.ts` strictly partitions items with `agency_level === 0` or matching `isDeliveryTransitItem` to `deliveryTransitItems` (0 tasks in `actionableItems`).

5. **Integrity Violation Assessment**:
   - Hardcoded test outputs embedded in source code: **None detected**.
   - Dummy or facade implementations: **None detected**.
   - Shortcuts bypassing task requirements: **None detected**.
   - Fabricated verification outputs: **None detected**.

---

## 3. Caveats & Minor Findings

1. **Meal Kit Prefix Casing Parity**:
   - In `supabase/functions/_shared/canonical-order-resolver.mjs` line 90, meal kit prefixes are lowercased (`return mealKitMatch[0].toLowerCase()`), returning `hf-12345678`.
   - In `src/utils/vendorTransactions.ts` line 82, meal kit prefixes were uppercased (`return mealKitMatch[0].toUpperCase()`), returning `HF-12345678`.
   - Note: Because `buildCompositeThreadKey` normalizes the canonical ID via `normalizeKeyPart`, both produce identical composite keys (`transaction:hellofresh:hf-12345678`). To maintain 100% server/client parity, `vendorTransactions.ts` line 82 should be aligned to `.toLowerCase()`.
2. **`normalizeKeyPart` Null Safety**:
   - In `supabase/functions/_shared/canonical-order-resolver.mjs`, `normalizeKeyPart` uses `String(value ?? '')` for null-safety.
   - In `src/utils/vendorTransactions.ts`, `normalizeKeyPart` should adopt the same fallback to guard against potential null/undefined invocations.

---

## 4. Conclusion

### **Verdict: APPROVE**

Milestone 3 (Deterministic Entity & Canonical Order Resolver) is **APPROVED**. The shared resolver module, edge function integration, and client transaction utilities correctly implement multi-vendor/carrier canonical identity resolution, monotonic lifecycle stage progression with future date guardrails, and 0% Executive Action Queue leakage. All required test suites and production builds pass with 100% success.

---

## 5. Verification Method

To independently verify the implementation:
```bash
# 1. Run canonical order resolver unit tests (11 tests)
node --test tests/canonical-order-resolver.test.mjs

# 2. Run vendor transaction producer unit tests (13 tests)
node --test tests/vendor-transaction-producer.test.mjs

# 3. Run full project regression suite (1,846 tests)
npm test

# 4. Run production TypeScript build & experience certification
npm run build
```
