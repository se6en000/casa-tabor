# Handoff Report: Milestone 3 Explorer 1 Investigation

**Agent**: Explorer 1  
**Milestone**: Milestone 3 — Deterministic Entity & Canonical Order Resolver  
**Timestamp**: 2026-08-23T11:49:15Z  
**Handoff Type**: Hard (Task complete)  
**Report File**: `/Users/taboj/casa-tabor/.agents/sub_orch_m3/explorer_1/report.md`

---

## 1. Observation

1. **Current Codebase State**:
   - `src/utils/vendorTransactions.ts` (741 lines) contains client-side order normalization (`canonicalizeOrderId`), stage detection (`transactionStage`), date-based effective stage resolution (`resolveEffectiveStage`), and item consolidation (`consolidateTransitItems`).
   - `supabase/functions/_shared/canonical-order-resolver.mjs` does **not exist** on disk.
   - `supabase/functions/scan-gmail-inbox/index.ts` (lines 564–670) contains an inline, duplicated implementation of `transactionIdentity()` and `canonicalizeTransactionOrderId()`.
   - `src/utils/needsYouFeed.ts` (lines 75–94) implements `splitActionableAndTransitItems` checking `item.agency_level === 0 || isDeliveryTransitItem(item)`.
   - `src/utils/actionInspectionSynthesis.ts` (lines 257–259, 739–741) explicitly suppresses suggested calendar events and action bundles when `isDeliveryTransitItem(item)` is true.
   - `src/types/index.ts` (lines 334–368) defines `DeliveryTransitStage`, `DeliveryUpdateEvent`, and `DeliveryTransitItem`.
2. **Current Test Suites**:
   - `tests/vendor-transaction-producer.test.mjs` (586 lines) contains 12 passing unit tests for Walmart, Amazon, Apple, Nike, Jiffy, future date guardrails, and feed splitting.
   - `tests/canonical-order-resolver.test.mjs` does **not exist**.
   - Running `npm test` executes **1,698 tests with 0 failures** in ~7.8 seconds (`node --test tests/*.test.mjs`).
3. **Database Schema & Migrations**:
   - `prep_items` columns `attention_thread_key`, `attention_vendor`, and `attention_stage` were added in migration `20260809201500_vendor_transaction_threads.sql`.
   - Columns `agency_level`, `policy_disclaimer`, and `source_origin` are actively supported and populated during ingestion.

---

## 2. Logic Chain

1. **Requirement R3** specifies deterministic multi-vendor entity and courier canonical resolution across both edge functions (`scan-gmail-inbox`) and client UI (`EstateLogisticsWidget.tsx`).
2. Having duplicate parsing logic inside `scan-gmail-inbox/index.ts` and `src/utils/vendorTransactions.ts` creates maintenance overhead and potential behavioral drift.
3. Creating a pure, dependency-free ES module at `supabase/functions/_shared/canonical-order-resolver.mjs` that implements the `CanonicalEntityResult` interface satisfies both Deno Edge Function execution and Node.js testing environments.
4. Refactoring `scan-gmail-inbox/index.ts` and `src/utils/vendorTransactions.ts` to import and utilize the unified rules ensures 100% consistent composite keys (`transaction:...` and `courier:...`), stages, and agency levels across all layers.
5. Creating `tests/canonical-order-resolver.test.mjs` and expanding `tests/vendor-transaction-producer.test.mjs` provides end-to-end unit and integration test coverage while maintaining 100% pass on the 1,698-test baseline.

---

## 3. Caveats

1. `tests/fixtures/email-benchmark.json` does not exist yet (scoped to Milestone 2); Milestone 3 tests must remain self-contained unit tests without external network or fixture dependencies.
2. DHL tracking formats (`10-11` digits, `GM...` eCommerce) must be added cleanly without causing false-positive matches on general 10-digit phone or order numbers.
3. No source code was modified during this investigation, in strict compliance with the read-only explorer constraint.

---

## 4. Conclusion

The investigation is complete. The system architecture, interfaces, regex patterns, lifecycle progression rules, date guardrails, and gaps have been thoroughly analyzed and documented. The worker can immediately proceed to implement `supabase/functions/_shared/canonical-order-resolver.mjs`, create `tests/canonical-order-resolver.test.mjs`, synchronize `scan-gmail-inbox/index.ts` and `src/utils/vendorTransactions.ts`, and run `npm test`.

---

## 5. Verification Method

To independently verify the findings in this report:

1. **Check missing files**:
   ```bash
   ls supabase/functions/_shared/canonical-order-resolver.mjs
   ls tests/canonical-order-resolver.test.mjs
   ```
2. **Verify existing vendor transaction tests**:
   ```bash
   node --test tests/vendor-transaction-producer.test.mjs
   ```
3. **Verify full regression test suite baseline (1,698 tests)**:
   ```bash
   npm test
   ```
4. **Inspect comprehensive investigation report**:
   View `/Users/taboj/casa-tabor/.agents/sub_orch_m3/explorer_1/report.md`
