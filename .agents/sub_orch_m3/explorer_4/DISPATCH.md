## 2026-08-23T12:00:47Z
You are Explorer 4 (Remediation Specialist) for Milestone 3: Deterministic Entity & Canonical Order Resolver (Iteration 2).
Working Directory: /Users/taboj/casa-tabor/.agents/sub_orch_m3/explorer_4/
Project Root: /Users/taboj/casa-tabor

MANDATORY FIRST STEP:
Read /Users/taboj/casa-tabor/.agents/ORIGINAL_REQUEST.md before doing anything else.

Also read:
- /Users/taboj/casa-tabor/PROJECT.md
- /Users/taboj/casa-tabor/.agents/sub_orch_m3/SCOPE.md
- /Users/taboj/casa-tabor/.agents/sub_orch_m3/challenger_1/handoff.md
- /Users/taboj/casa-tabor/.agents/sub_orch_m3/challenger_2/handoff.md
- /Users/taboj/casa-tabor/.agents/sub_orch_m3/reviewer_2/handoff.md
- /Users/taboj/casa-tabor/tests/adversarial-canonical-order-resolver.test.mjs

Your Objective:
Analyze the exact failures reported by Challenger 1 and Challenger 2 and formulate a precise, complete remediation plan for Worker 2:
1. Date validity safety in `src/utils/vendorTransactions.ts` (preventing `RangeError: Invalid time value` when malformed dates are passed to `formatDeliveryEta`, `buildDeliveryTransitItem`, and `resolveCanonicalEntity`).
2. Interior whitespace / punctuation sanitization for Apple (`W...`) and Nike (`C0...`) in `canonicalizeOrderId` across both `supabase/functions/_shared/canonical-order-resolver.mjs` and `src/utils/vendorTransactions.ts`.
3. Out-of-order chronological cost and policy merging in `mergeDeliveryTransitItem` (`src/utils/vendorTransactions.ts`).
4. Property check parity in `isPerishableDelivery` across both `supabase/functions/_shared/canonical-order-resolver.mjs` and `src/utils/vendorTransactions.ts`.
5. Noise / non-delivery filtering in `splitActionableAndTransitItems` (`src/utils/needsYouFeed.ts`), ensuring marketing emails with `agency_level: 0` are not mistakenly routed to `rawTransitItems`.
6. Ensure full pass on all test suites: `tests/adversarial-canonical-order-resolver.test.mjs`, `tests/canonical-order-resolver.test.mjs`, `tests/vendor-transaction-producer.test.mjs`, `tests/e2e-email-intelligence-tiers.test.mjs`, `npm test`, and `npm run build`.

Output Requirements:
Write your remediation report to `/Users/taboj/casa-tabor/.agents/sub_orch_m3/explorer_4/report.md`.
Send a message when complete. Do NOT modify source code files.
