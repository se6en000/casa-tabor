## 2026-08-23T11:45:56Z
You are the Sub-Orchestrator for Milestone 3: Deterministic Entity & Canonical Order Resolver.
Working Directory: /Users/taboj/casa-tabor/.agents/sub_orch_m3/
Project Root: /Users/taboj/casa-tabor
Original User Request: /Users/taboj/casa-tabor/.agents/ORIGINAL_REQUEST.md
Project Master Scope: /Users/taboj/casa-tabor/PROJECT.md

Scope & Mission (R3):
Implement multi-vendor canonical identity resolution that normalizes order numbers (Walmart, Amazon, Target, Apple, Nike, Jiffy, HelloFresh) and tracking numbers (UPS, FedEx, USPS, DHL) into unified composite thread keys, ensuring hyphenated/unhyphenated and multi-stage updates consolidate seamlessly.
Ensure:
- Tense-aware lifecycle stage resolution (`confirmed`, `payment`, `shipped`, `out_for_delivery`, `delivered`, `problem`).
- Future arrival date guardrails (future deliveries stay in-transit and never prematurely mark `delivered`).
- Past courier auto-resolution (only same-day courier dispatches from past days auto-resolve).
- 0% leakage into Executive Action Queue by assigning `agency_level: 0` to passive logistics and extracting `policy_disclaimer`.

Instructions & Protocol:
1. Maintain your state in /Users/taboj/casa-tabor/.agents/sub_orch_m3/ (SCOPE.md, plan.md, progress.md, handoff.md).
2. Follow the orchestrator iteration procedure (Explorer -> Worker -> Reviewer -> Challenger -> Forensic Auditor -> Gate).
3. Files Owned: `src/utils/vendorTransactions.ts`, `supabase/functions/_shared/canonical-order-resolver.mjs`, `tests/vendor-transaction-producer.test.mjs`, `tests/canonical-order-resolver.test.mjs`.
4. Run and verify all unit tests. Ensure 100% pass on existing tests.
5. MANDATORY INTEGRITY WARNING: DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A forensic auditor will independently verify your work.
6. When complete and passed through review/audit gates, write your handoff.md and send a message to parent.

## 2026-08-23T12:12:00Z (Gen 2 Dispatch)
Resume work at /Users/taboj/casa-tabor/.agents/sub_orch_m3/. Read handoff.md, BRIEFING.md, ORIGINAL_REQUEST.md, DISPATCH.md, and progress.md for current state.
Your parent is 18c2d770-6afb-45a3-98cb-ced53b25dfcd — use this ID for all escalation and status reporting (send_message).

Mission:
Complete Milestone 3 (Deterministic Entity & Canonical Order Resolver) Iteration 3:
1. Spawn a Worker to apply the permutation sorting fix in `consolidateTransitItems` / `mergeDeliveryTransitItem` (`src/utils/vendorTransactions.ts`) as detailed in `handoff.md`.
2. Run and verify all test suites (`tests/challenger4-stress-test.mjs`, `tests/adversarial-canonical-order-resolver.test.mjs`, `tests/canonical-order-resolver.test.mjs`, `tests/vendor-transaction-producer.test.mjs`, `npm test`, `npm run build`).
3. Dispatch verification team (Reviewer, Challenger, Forensic Auditor).
4. Evaluate Gate Status and pass criteria.
5. Deliver completion report to parent (`18c2d770-6afb-45a3-98cb-ced53b25dfcd`).
