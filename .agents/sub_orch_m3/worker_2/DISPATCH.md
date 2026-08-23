# Dispatch

## 2026-08-23T12:04:56Z

You are Worker 2 for Milestone 3: Deterministic Entity & Canonical Order Resolver (Iteration 2 Remediation).
Working Directory: /Users/taboj/casa-tabor/.agents/sub_orch_m3/worker_2/
Project Root: /Users/taboj/casa-tabor

MANDATORY FIRST STEP:
Read /Users/taboj/casa-tabor/.agents/ORIGINAL_REQUEST.md before doing anything else.

Also read:
- /Users/taboj/casa-tabor/PROJECT.md
- /Users/taboj/casa-tabor/.agents/sub_orch_m3/SCOPE.md
- /Users/taboj/casa-tabor/.agents/sub_orch_m3/explorer_4/report.md
- /Users/taboj/casa-tabor/tests/adversarial-canonical-order-resolver.test.mjs

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Tasks & Responsibilities:
Implement all 5 targeted code changes detailed in `/Users/taboj/casa-tabor/.agents/sub_orch_m3/explorer_4/report.md`:
1. In `src/utils/vendorTransactions.ts`:
   - Add date validity checks (`instanceof Date && !isNaN(d.getTime())`) to `formatDeliveryEta`, `buildDeliveryTransitItem`, `resolveEffectiveStage`, `isItemArrivingToday`, `isItemScheduledLater`, and `resolveCanonicalEntity` to prevent `RangeError: Invalid time value` on unparseable/malformed dates.
   - Sanitize internal whitespace/punctuation (`clean.replace(/[\s.-]+/g, '')`) in `canonicalizeOrderId` for Apple (`W...`) and Nike (`C0...`).
   - In `mergeDeliveryTransitItem`: Prioritize cost, policyDisclaimer, and rawItem chronologically based on `isLatestIncoming = (new Date(incoming.occurredAt).getTime() || 0) >= (new Date(existing.occurredAt).getTime() || 0)`.
   - In `isPerishableDelivery`: Support both `{ title, vendor, description }` and `{ event_title, attention_vendor, description }`.
   - Ensure `normalizeKeyPart` is null/undefined safe (`String(value ?? '')`).
2. In `supabase/functions/_shared/canonical-order-resolver.mjs`:
   - Sanitize internal whitespace/punctuation in `canonicalizeOrderId` for Apple and Nike matching `src/utils/vendorTransactions.ts`.
3. In `src/utils/needsYouFeed.ts`:
   - In `splitActionableAndTransitItems`: Segregate feeds so only `isDeliveryTransitItem(item)` items populate `rawTransitItems`, while items with `agency_level !== 0` populate `actionableItems` (promotional noise with `agency_level: 0` is cleanly ignored).
4. Run all verification commands and document results:
   - `node --test tests/adversarial-canonical-order-resolver.test.mjs`
   - `node --test tests/canonical-order-resolver.test.mjs`
   - `node --test tests/vendor-transaction-producer.test.mjs`
   - `node --test tests/e2e-email-intelligence-tiers.test.mjs`
   - `npm test`
   - `npm run build`

Output Requirements:
Write your handoff report to `/Users/taboj/casa-tabor/.agents/sub_orch_m3/worker_2/handoff.md`.
Send a message when complete.
