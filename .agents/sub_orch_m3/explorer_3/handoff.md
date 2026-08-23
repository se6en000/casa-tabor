# Handoff Report — Explorer 3 (Spec Miner)
**Milestone 3: Deterministic Entity & Canonical Order Resolver**
**Author**: Explorer 3 (Specification Miner)
**Date**: 2026-08-23

---

## 1. Observation
- Inspected `/Users/taboj/casa-tabor/.agents/ORIGINAL_REQUEST.md` lines 24-26 (§R3) requiring multi-vendor canonical identity resolution (Amazon, Walmart, Target, Apple, Nike, Jiffy, HelloFresh) and tracking numbers (UPS, FedEx, USPS, DHL) into unified composite thread keys with tense-aware lifecycle progression.
- Inspected `/Users/taboj/casa-tabor/PROJECT.md` lines 63-78 defining the `CanonicalEntityResult` interface contract with `vendor`, `vendorKey`, `orderId`, `canonicalOrderId`, `trackingNumber`, `carrier`, `compositeThreadKey`, `effectiveStage`, `isPerishable`, `policyDisclaimer`, and `agencyLevel`.
- Inspected `/Users/taboj/casa-tabor/src/utils/vendorTransactions.ts` lines 42-66 (`canonicalizeOrderId`), lines 73-127 (`orderId`), lines 129-184 (`transactionStage`), lines 239-258 (`vendorTransactionIdentity`), lines 321-406 (`mergeDeliveryTransitItem`), lines 408-461 (`consolidateTransitItems`), lines 574-610 (`resolveEffectiveStage`), and lines 684-740 (`buildDeliveryTransitItem`).
- Inspected `/Users/taboj/casa-tabor/src/utils/needsYouFeed.ts` lines 75-94 (`splitActionableAndTransitItems`) demonstrating strict 0% leakage filtering where `item.agency_level === 0 || isDeliveryTransitItem(item)` routes to `deliveryTransitItems`.
- Inspected `/Users/taboj/casa-tabor/supabase/functions/scan-gmail-inbox/index.ts` lines 564-669 (`canonicalizeTransactionOrderId`, `transactionDescriptor`, `transactionIdentity`) and lines 730-780 (idempotent stage progression in `prep_items`).
- Executed `node --test tests/vendor-transaction-producer.test.mjs` verifying all 12 existing test suites pass with 0 failures (`✔ multi-vendor order number canonicalization accurately normalizes Walmart, Amazon, Target, Apple, Nike, Jiffy, and HelloFresh`).
- Discovered and fully specified patterns and canonicalization algorithms for all 7 primary vendor formats and 4 courier tracking formats (UPS 1Z/MI, FedEx 12/14/15/20/22, USPS 20-24 & S10 13-char, DHL 10-11 & eCommerce).

---

## 2. Logic Chain
1. *From ORIGINAL_REQUEST §R3 and PROJECT.md §1*: Canonical identity resolution must unify hyphenated/unhyphenated variants, leading zeros, and multi-stage updates into a deterministic composite thread key (`transaction:${vendorKey}:${orderId}`).
2. *From vendorTransactions.ts lines 42-66 and scan-gmail-inbox/index.ts lines 576-600*: Amazon requires 3-7-7 formatting (`XXX-XXXXXXX-XXXXXXX`), Walmart requires 7-8 formatting (`XXXXXXX-XXXXXXXX`), Apple requires uppercase `WXXXXXXXXX`, Nike requires uppercase `C0XXXXXXXXX`, Target requires clean numeric digits, Jiffy requires 10-digit numeric ID, and Meal Kits require uppercase prefix `HF-XXXXXXXX`.
3. *From vendorTransactions.ts lines 574-610*: State resolution requires tense awareness where future delivery target dates cannot be `delivered` (downgrading to `confirmed`/`shipped`), whereas past same-day courier dispatches (`out_for_delivery`) auto-resolve to `delivered`.
4. *From needsYouFeed.ts lines 75-94 and actionInspectionSynthesis.ts lines 354-416*: Passive logistics items and return/claim policy disclaimers must be assigned `agency_level: 0`, preventing any false tasks or calendar event noise from leaking into the Executive Action Queue.
5. *From report.md*: Compiled the authoritative specification covering 25 discovered features, 16 edge cases, complete regex patterns, state transition matrices, and test strategies.

---

## 3. Caveats
- No modifications were made to source code files (strictly read-only discovery per Spec Miner role).
- `supabase/functions/_shared/canonical-order-resolver.mjs` and `tests/canonical-order-resolver.test.mjs` are specified for implementation by Milestone 3 Workers.
- The carrier tracking regexes account for standard domestic and international formats; unusual private freight carriers (e.g. freight carriers with non-standard bills of lading) fall back to generic order tracking or date-based keys.

---

## 4. Conclusion
- All domain requirements, vendor patterns, courier tracking formats, composite thread keys, lifecycle state transitions, temporal date logic, and queue filtering rules are exhaustively documented in `/Users/taboj/casa-tabor/.agents/sub_orch_m3/explorer_3/report.md`.
- The specification provides concrete regexes, algorithms, transition matrices, and edge case assertions ready for implementation by the Worker agent.

---

## 5. Verification Method
1. Inspect report: `view_file /Users/taboj/casa-tabor/.agents/sub_orch_m3/explorer_3/report.md`.
2. Run existing test suite to verify baseline: `node --test tests/vendor-transaction-producer.test.mjs`.
3. Invalidation conditions: Any discrepancy in vendor order regexes, carrier tracking lengths, or state transition priority ranks against the documented specification in `report.md`.
