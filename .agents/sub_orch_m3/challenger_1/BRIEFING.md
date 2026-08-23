# BRIEFING — 2026-08-23T12:00:00Z

## Mission
Adversarially challenge and stress-test the Canonical Order Resolver across edge cases, fuzzing, courier auto-resolution, arrival date invariants, and Action Queue 0% leakage.

## 🔒 My Identity
- Archetype: challenger / critic
- Roles: critic, specialist
- Working directory: /Users/taboj/casa-tabor/.agents/sub_orch_m3/challenger_1
- Original parent: 2796d939-3ba1-4f06-bf95-9c7a74c92eb0
- Milestone: Milestone 3 - Deterministic Entity & Canonical Order Resolver
- Instance: 1 of 1

## 🔒 Key Constraints
- Review-only — do NOT modify implementation code directly
- Must empirically execute all tests and verifications
- 0% Action Queue leakage under adversarial inputs
- Never allow future arrival dates to resolve to delivered
- Verify past courier auto-resolution strictly applies to same-day out-for-delivery dispatches and never to open multi-day freight shipments

## Current Parent
- Conversation ID: 2796d939-3ba1-4f06-bf95-9c7a74c92eb0
- Updated: 2026-08-23T12:00:00Z

## Review Scope
- **Files to review**:
  - `supabase/functions/_shared/canonical-order-resolver.mjs`
  - `src/utils/vendorTransactions.ts`
  - `tests/canonical-order-resolver.test.mjs`
  - `tests/vendor-transaction-producer.test.mjs`
  - `tests/adversarial-canonical-order-resolver.test.mjs`
- **Interface contracts**: `/Users/taboj/casa-tabor/PROJECT.md`, `/Users/taboj/casa-tabor/.agents/sub_orch_m3/SCOPE.md`
- **Review criteria**: Correctness, invariant preservation, robustness against fuzzing and adversarial inputs.

## Attack Surface
- **Hypotheses tested**:
  - Exotic whitespace & control chars (\t, \n, \r, \u00A0, \u200B)
  - Mixed-case & vendor prefix normalization (Apple W-prefix, Nike C0-prefix, Amazon D01, Walmart WM-)
  - Compound order + multiple courier tracking numbers in single email
  - Query-dense and percent-encoded URLs
  - Extreme future (2099), extreme past (1970), leap year, and invalid dates
  - Future arrival date delivered invariant
  - Past courier auto-resolution strictness (same-day out-for-delivery only, not multi-day freight)
  - 0% Action Queue leakage under adversarial disclaimers/deadlines
  - 500-iteration random fuzzing harness
- **Vulnerabilities found**:
  1. `RangeError: Invalid time value` crash in `src/utils/vendorTransactions.ts` when malformed/invalid dates are passed to `resolveCanonicalEntity`, `formatDeliveryEta`, or `buildDeliveryTransitItem`.
  2. Apple and Nike order number canonicalization preserves interior spaces/non-breaking spaces, causing thread key divergence (`transaction:apple:w-123456789` vs `transaction:apple:w123456789`).
  3. Spaced courier tracking barcodes (e.g. `1Z 999 999 99...`) are not recognized by `detectCarrierAndTracking` without pre-stripping.
- **Untested angles**: None. Full matrix and fuzzing harness completed.

## Loaded Skills
- None

## Key Decisions Made
- Executed empirical adversarial suite `tests/adversarial-canonical-order-resolver.test.mjs`.
- Confirmed core invariants (Future arrival date never delivered, past courier auto-resolution strictness, 0% action queue leakage).
- Issued `REQUEST_CHANGES` verdict due to unhandled `RangeError` on invalid dates in `vendorTransactions.ts` and Apple/Nike whitespace canonicalization thread key divergence.

## Artifact Index
- `tests/adversarial-canonical-order-resolver.test.mjs` — Comprehensive adversarial test suite (10 test suites)
- `.agents/sub_orch_m3/challenger_1/handoff.md` — Final verification & stress test report
