# Scope: Milestone 3 — Deterministic Entity & Canonical Order Resolver

## Architecture & Responsibilities
- Provide multi-vendor canonical identity resolution for orders and shipments across the client and edge functions.
- Canonical Order Resolver in `supabase/functions/_shared/canonical-order-resolver.mjs` and vendor transaction utilities in `src/utils/vendorTransactions.ts`.
- Comprehensive testing in `tests/vendor-transaction-producer.test.mjs` and `tests/canonical-order-resolver.test.mjs`.

## Feature Requirements
1. **Multi-Vendor Canonical Identity Resolution**:
   - Order number normalization for major vendors: Walmart, Amazon, Target, Apple, Nike, Jiffy, HelloFresh, etc.
   - Courier tracking number normalization: UPS, FedEx, USPS, DHL.
   - Seamless composite thread key generation unifying hyphenated/unhyphenated variants, leading zeros, and multi-stage shipment updates.
2. **Tense-Aware Lifecycle Stage Resolution**:
   - Correctly distinguish and map states: `confirmed`, `payment`, `shipped`, `out_for_delivery`, `delivered`, `problem`.
   - Prevent state regressions unless explicit problem/cancellation occurs.
3. **Future Arrival Date Guardrails**:
   - Future deliveries stay in-transit / out_for_delivery and NEVER prematurely mark `delivered` even if ambiguous past tense text appears.
4. **Past Courier Auto-Resolution**:
   - Auto-resolve courier tracking only when same-day courier dispatches are from past calendar days without lingering blocker signals.
5. **0% Leakage into Executive Action Queue**:
   - Ensure passive logistics notifications are assigned `agency_level: 0`.
   - Extract and preserve `policy_disclaimer` / return window metadata without triggering false user action requirements.

## Owned Files
- `src/utils/vendorTransactions.ts`
- `supabase/functions/_shared/canonical-order-resolver.mjs`
- `tests/vendor-transaction-producer.test.mjs`
- `tests/canonical-order-resolver.test.mjs`

## Milestones & Status
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M3 | Deterministic Entity & Canonical Order Resolver | Canonical order resolution, vendor transaction normalizer, test suite | M1/M2 | DONE |
