## 2026-08-23T11:59:41Z
You are Worker 2 for Milestone 1 Iteration 2: Historical Corpus Harvester & Semantic Clusterer.
Working Directory: /Users/taboj/casa-tabor/.agents/sub_orch_m1/worker_2/
Project Root: /Users/taboj/casa-tabor

MANDATORY INPUTS (Read these files FIRST before writing code):
1. /Users/taboj/casa-tabor/.agents/ORIGINAL_REQUEST.md
2. /Users/taboj/casa-tabor/PROJECT.md
3. /Users/taboj/casa-tabor/.agents/sub_orch_m1/SCOPE.md
4. /Users/taboj/casa-tabor/.agents/sub_orch_m1/synthesis_it2.md
5. /Users/taboj/casa-tabor/.agents/sub_orch_m1/explorer_1_it2/report.md
6. /Users/taboj/casa-tabor/.agents/sub_orch_m1/explorer_2_it2/report.md
7. /Users/taboj/casa-tabor/.agents/sub_orch_m1/explorer_3_it2/report.md
8. /Users/taboj/casa-tabor/.agents/sub_orch_m1/challenger_1/report.md
9. /Users/taboj/casa-tabor/.agents/sub_orch_m1/challenger_2/report.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A forensic auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE WRITE OWNERSHIP:
- `supabase/functions/_shared/email-clusterer.mjs`
- `src/lib/email-clustering.ts`
- `scripts/harvest-historical-email-corpus.mjs`
- `tests/email-harvester-clusterer.test.mjs`
- Files in your working directory `/Users/taboj/casa-tabor/.agents/sub_orch_m1/worker_2/`

TASKS:
1. Apply the PII Redaction & Zero-Leakage Corpus Enhancements in `supabase/functions/_shared/email-clusterer.mjs`:
   - Extend SSN regex for dot (`.`), underscore (`_`), space (` `), and raw 9-digit formats.
   - Extend Credit Card PAN regex for dot-separated formats while preserving Amazon/Walmart order IDs.
   - Add ITU-T E.164 compliant international phone regex (`+44`, `+33`, `+81`, `+1-xxx-xxx-xxxx`).
   - Add PO Box address regex (`P.O. Box 123`, `PO Box 45678`, `Post Office Box ...`).
   - Ensure `clusterEmailCorpus` and `anonymizeEmail` sanitize `snippet`, `to`, `from`, `bodyHtml`, and `bodyText` so no raw PII leaks into `data/historical-email-corpus.json`.

2. Apply Classification Precedence & Retailer Promotional Fixes in `supabase/functions/_shared/email-clusterer.mjs`:
   - Pre-screen hybrid retail domains (`amazon.com`, `walmart.com`, `target.com`, `chewy.com`, `doordash.com`, `instacart.com`, `hellofresh.com`) for promotional tokens/headers. Route marketing emails to `promotional_noise` (confidence 0.98).
   - Only route retail domains to `logistics_parcels` if explicit transactional tokens are present.
   - Unwrap multi-hop forwarded headers (`Fwd:`, `Forwarded message`) with `lastIndexOf` / regex stripping.

3. Apply Utility Billing vs Outage Precedence Hierarchy:
   - Fraud -> Billing/Past-Due/Disconnection (`executive_actions` / `action_bill_payment`) -> Outage (`lifecycle_updates` / `utility_service_outage`) -> Info Guides.
   - Refine outage regex to prevent false matching on late-payment "avoid disruption of service" notices.

4. Update `scripts/harvest-historical-email-corpus.mjs` and regenerate `data/historical-email-corpus.json` verifying 0 raw PII leakage and high accuracy.

5. Update `tests/email-harvester-clusterer.test.mjs` to incorporate all edge cases and regression checks.

6. Run and verify all test suites:
   - `node --test tests/email-harvester-clusterer.test.mjs`
   - `node --test tests/adversarial-clusterer.test.mjs`
   - `node --test tests/email-clusterer-stress.test.mjs`
   - `node --test tests/*.test.mjs`
   - `npx tsc --noEmit`
   Ensure 100% test pass rate with 0 failures across all suites.

7. Write comprehensive report to `/Users/taboj/casa-tabor/.agents/sub_orch_m1/worker_2/report.md` and handoff report to `/Users/taboj/casa-tabor/.agents/sub_orch_m1/worker_2/handoff.md`.
8. Send message to parent orchestrator when complete.
