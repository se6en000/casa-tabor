# Forensic Audit Report: Milestone 3 — Deterministic Entity & Canonical Order Resolver

**Work Product**: Milestone 3 (`supabase/functions/_shared/canonical-order-resolver.mjs`, `src/utils/vendorTransactions.ts`, `supabase/functions/scan-gmail-inbox/index.ts`, `tests/canonical-order-resolver.test.mjs`, `tests/vendor-transaction-producer.test.mjs`)  
**Profile**: General Project  
**Integrity Mode**: Development (from `ORIGINAL_REQUEST.md`)  
**Verdict**: **CLEAN**

---

## 1. Observation

### 1.1 Source Code and Architecture Inspection
- **Shared Pure ES Module** (`supabase/functions/_shared/canonical-order-resolver.mjs`):
  - Zero external npm/Deno dependencies.
  - Implements general-purpose parsing and normalization algorithms:
    - `canonicalizeOrderId(vendor, rawId)`: General string slicing and regex normalizers for Walmart (15/16-digit 7-8 splitting, prefix stripping), Amazon (17-digit 3-7-7 and D01 digital), Apple (`W\d{9,10}`), Nike (`C[0-]\d{9,11}`), Target (10-14 digits), Jiffy (8-12 digits), HelloFresh/meal kits (`(?:HF|GC|BA|FACT)-\d{6,10}`).
    - `canonicalizeTrackingNumber(carrier, rawTracking)`: Standardizes UPS (1Z / Mail Innovations), FedEx (12, 14, 15, 20-22 digits), USPS (20-24 routing barcodes, 13-char UPU S10), and DHL (10-11 AWB, GM/LX/RX/JD eCommerce).
    - `detectCarrierAndTracking(text)`: Extracts carrier, tracking number, and valid tracking URLs.
    - `detectVendor(text, vendorHint)`: Matches against `VENDOR_ALIASES` while filtering out street addresses (`isAddressLike`).
    - `detectVendorAndOrder(text, vendorHint)`: Multi-pattern extraction covering standard formatting, explicit labels, URL query parameters (`orderId=...`), and hashtags.
    - `buildCompositeThreadKey(params)`: Deterministic hierarchical key precedence (`transaction:${vendorKey}:${canonicalOrderId}` -> `courier:${carrier}:${tracking}` -> `transaction:${vendorKey}:items:${descriptor}` -> `delivery:${vendorKey}:${dateKey}` -> fallback).
    - `resolveTransactionStage(itemOrText)`: 6-stage monotonic resolution with in-preparation lock (`confirmed` Step 0), tense-aware delivery detection, and problem exception handling.
    - `resolveEffectiveStage(rawStage, deliveryDate, now)`: Future Arrival Date Guardrail (downgrading `delivered` to `confirmed` if `deliveryDate > now`) and Past Courier Auto-Resolution (auto-resolving `out_for_delivery` to `delivered` if `deliveryDate < now`, while keeping multi-day freight in active stage).
    - `extractPolicyDisclaimer(text)`: Footnote regex extracting return and missing/damage claim policies without triggering problem states.
    - `isPerishableDelivery(textOrItem)`: Keywords identifying groceries, meal kits, and refrigerated parcels.
    - `formatDeliveryEta(rawEta, deliveryDate, stage, now)`: Dynamic relative day formatting (`Delivered today`, `Delivered yesterday`, `Tomorrow (by 2pm)`, `Mon, Aug 24`).
    - `resolveCanonicalEntity(input, options)`: Conforms strictly to `CanonicalEntityResult` from `PROJECT.md §Interface Contracts`, enforcing `agencyLevel: 0` for passive logistics items.

- **Client Utilities Synchronization** (`src/utils/vendorTransactions.ts`):
  - Exports `resolveCanonicalEntity`, `detectCarrierAndTracking`, `canonicalizeOrderId`, `canonicalizeTrackingNumber`, `detectVendorAndOrder`, `buildCompositeThreadKey`, `resolveEffectiveStage`, and `formatDeliveryEta`.
  - Integrates `date-fns` for UI rendering and consolidation (`consolidateTransitItems`, `mergeDeliveryTransitItem`, `isItemArrivingToday`, `isItemScheduledLater`, `isItemDelivered`, `isItemInTransit`).

- **Edge Function Integration** (`supabase/functions/scan-gmail-inbox/index.ts`):
  - Imports from `../_shared/canonical-order-resolver.mjs` (lines 26–33).
  - Uses shared functions in `transactionIdentity` (lines 588–623) to compute `threadKey`, `vendor`, and `stage`.
  - Persists `attention_thread_key`, `attention_vendor`, `attention_stage`, `agency_level: 0`, and `policy_disclaimer` in `persistInboxActions` (lines 681–704).

### 1.2 Prohibited Patterns Check (General Profile — Development Mode)
| # | Prohibited Pattern | Status | Direct Evidence |
|---|--------------------|--------|-----------------|
| 1 | **Hardcoded test results** | **PASS** | No string literal lookup tables, fixed output mappings, or test-case-specific returns found in `canonical-order-resolver.mjs` or `vendorTransactions.ts`. |
| 2 | **Facade implementations** | **PASS** | All 12 exported functions contain full algorithmic logic, multi-branch regexes, calendar day math, and state machines. |
| 3 | **Fabricated verification outputs** | **PASS** | No pre-existing `.log` or fake attestation files. All tests execute live via `node --test`. |
| 4 | **Self-certifying tests** | **PASS** | Tests in `tests/canonical-order-resolver.test.mjs` and `tests/vendor-transaction-producer.test.mjs` assert against independent multi-vendor business specifications and fixtures. |
| 5 | **Execution delegation** | **PASS** | Shared module has 0 external dependencies and contains standalone native JavaScript algorithms. |

### 1.3 Test Suite Execution Results
- `node --test tests/canonical-order-resolver.test.mjs`
  - 11/11 passing tests (0 failures, duration ~78ms).
- `node --test tests/vendor-transaction-producer.test.mjs`
  - 13/13 passing tests (0 failures, duration ~625ms).
- `node -e "<synthetic arbitrary test matrix>"`
  - Verified unseen arbitrary order numbers (e.g. Walmart 15-digit `987654321098765`, Amazon 17-digit `99988887777666655`, Apple `W554433221`, Nike `C09988776655`, DHL `9988776655`, UPS `1ZABCDEF0123456789`) -> ALL PASSED.
- Adversarial Invariant Suites (`tests/adversarial-canonical-order-resolver.test.mjs`):
  - Invariant 1 (Future dates never resolve to delivered): PASSED across full date/phrasing matrix.
  - Invariant 2 (Past courier auto-resolution strictly limited to same-day out_for_delivery): PASSED.
  - Invariant 3 (0% Action Queue leakage under adversarial inputs): PASSED.
  - 120-permutation monotonic lifecycle stage convergence: PASSED.
  - Cross-vendor and cross-carrier collision resistance: PASSED.

---

## 2. Logic Chain

1. **Direct Inspection**: Analyzed the full implementations of `supabase/functions/_shared/canonical-order-resolver.mjs` and `src/utils/vendorTransactions.ts`. Found that order canonicalization uses general regular expressions and arithmetic slicing (e.g. `digitsOnly.slice(0, 7) + '-' + digitsOnly.slice(7)` for Walmart, `slice(0,3)+'-'+slice(3,10)+'-'+slice(10)` for Amazon) rather than hardcoded equality checks.
2. **Behavioral Testing**: Executed both official test suites (`tests/canonical-order-resolver.test.mjs` and `tests/vendor-transaction-producer.test.mjs`) and verified that 24 unit and integration tests execute live and pass cleanly.
3. **Generalization Verification**: Executed independent synthetic test runs using randomly generated and arbitrary unseen vendor IDs, courier tracking numbers, and future/past date combinations. All outputs matched the expected canonical formats and state invariants.
4. **Integration Verification**: Verified that `scan-gmail-inbox/index.ts` actively imports and delegates transaction descriptor keying, vendor detection, and stage resolution to `_shared/canonical-order-resolver.mjs`.
5. **Invariant Adherence**: Verified that future target dates (`deliveryDate > now`) never mark an order as `delivered` (overriding to `confirmed`), past same-day courier dispatches auto-resolve to `delivered`, past multi-day freight remains in active transit, and passive return/claim policies extract `agencyLevel: 0` with 0% leakage into the Executive Action Queue.

---

## 3. Caveats
- `supabase/functions/_shared/canonical-order-resolver.mjs` uses pure native JavaScript `Date` and `Math.round` for calendar arithmetic to ensure zero dependencies in Deno Edge Functions, while `src/utils/vendorTransactions.ts` uses `date-fns` for UI formatting. Both implementations share identical algorithmic behaviors and state machine rules.
- Minor observation: In V8 JavaScript engines, strings with trailing numbers like `invalid-date-string-12345` parse into extended ISO years (`+012345-01-01`). Proper date formats (e.g. ISO 8601 or `YYYY-MM-DD`) are handled reliably across all platforms.

---

## 4. Conclusion
**Verdict: CLEAN**

Milestone 3 (Deterministic Entity & Canonical Order Resolver) has passed forensic audit with zero integrity violations. The implementation is authentic, general-purpose, fully integrated into both edge functions and client utilities, and verified by comprehensive unit, integration, and adversarial stress tests.

---

## 5. Verification Method
To independently reproduce the forensic checks:

```bash
# 1. Run canonical order resolver test suite
node --test tests/canonical-order-resolver.test.mjs

# 2. Run vendor transaction producer test suite
node --test tests/vendor-transaction-producer.test.mjs

# 3. Verify synthetic general-purpose ID resolution
node -e '
import assert from "node:assert/strict";
import { canonicalizeOrderId, canonicalizeTrackingNumber, buildCompositeThreadKey, resolveEffectiveStage } from "./supabase/functions/_shared/canonical-order-resolver.mjs";
assert.equal(canonicalizeOrderId("Walmart", "987654321098765"), "9876543-21098765");
assert.equal(canonicalizeOrderId("Amazon", "99988887777666655"), "999-8888777-7666655");
assert.equal(canonicalizeTrackingNumber("ups", "1zabcdef0123456789"), "1ZABCDEF0123456789");
assert.equal(buildCompositeThreadKey({ vendor: "Walmart", canonicalOrderId: "9876543-21098765" }), "transaction:walmart:9876543-21098765");
assert.equal(resolveEffectiveStage("delivered", new Date("2026-08-25T12:00:00Z"), new Date("2026-08-23T12:00:00Z")), "confirmed");
console.log("Forensic empirical verification: PASS");
'
```
