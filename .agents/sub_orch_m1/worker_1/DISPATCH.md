## 2026-08-23T11:49:56Z
You are Worker 1 for Milestone 1: Historical Corpus Harvester & Semantic Clusterer.
Working Directory: /Users/taboj/casa-tabor/.agents/sub_orch_m1/worker_1/
Project Root: /Users/taboj/casa-tabor

MANDATORY INPUTS (Read these files FIRST before writing code):
1. /Users/taboj/casa-tabor/.agents/ORIGINAL_REQUEST.md
2. /Users/taboj/casa-tabor/PROJECT.md
3. /Users/taboj/casa-tabor/.agents/sub_orch_m1/SCOPE.md
4. /Users/taboj/casa-tabor/.agents/sub_orch_m1/synthesis.md
5. /Users/taboj/casa-tabor/.agents/sub_orch_m1/explorer_1/report.md
6. /Users/taboj/casa-tabor/.agents/sub_orch_m1/explorer_2/report.md
7. /Users/taboj/casa-tabor/.agents/sub_orch_m1/explorer_3/report.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A forensic auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE WRITE OWNERSHIP (You may only modify/create these files):
- `supabase/functions/_shared/email-clusterer.mjs`
- `src/lib/email-clustering.ts`
- `scripts/harvest-historical-email-corpus.mjs`
- `tests/email-harvester-clusterer.test.mjs`
- Files in your working directory `/Users/taboj/casa-tabor/.agents/sub_orch_m1/worker_1/`

TASKS:
1. Implement the complete PII Redaction & 6-Archetype Semantic Clustering Engine in `supabase/functions/_shared/email-clusterer.mjs`:
   - Multi-pass PII Redaction: Names, 10/11-digit phone numbers, personal email addresses, physical street addresses + ZIPs, credit card numbers (Luhn/13-19 digits), bank routing/account numbers, SSNs, passwords/tokens. Preserve masked tracking formats, merchant names, dates.
   - 6 Semantic Archetypes:
     1. `Logistics & Parcels` (e-commerce, groceries, couriers, meal kits)
     2. `Executive Action Tasks` (permission slips, waivers, bills/invoices, registrations)
     3. `Temporal Appointments` (doctor, school, travel, sports)
     4. `Lifecycle State Updates` (flight schedule changes, order edits, delivery delays)
     5. `Estate Context & Knowledge` (newsletters, HOA, maintenance)
     6. `Promotional Noise` (marketing, sales, automated digests)
   - 4-Tier Hybrid Classifier (sender heuristics, intent token analysis, Bayesian/TF-IDF scoring, confidence rating with 0% false escalation to Executive Action Tasks).
   - Entity Extractor: merchant/org, dates/times, tracking codes (masked), action URLs, amounts.
   - Deduplication: compute content/thread fingerprints and identify exact/near duplicates.

2. Implement TypeScript wrapper `src/lib/email-clustering.ts` exporting clean types and functions for UI / Supabase client use.

3. Implement CLI Harvester `scripts/harvest-historical-email-corpus.mjs`:
   - CLI flags: `--source=[supabase|gmail|synthetic]`, `--limit=1000`, `--out=[filepath]`, `--anonymize`, `--cluster`.
   - Built-in realistic synthetic generator capable of producing 1,000+ high-fidelity emails spanning Primary, Updates, Promotions across all 6 archetypes.
   - Supabase extractor fetching from `inbox_emails` / `processed_messages` if database available.
   - Full statistics report (PII counts, archetype distribution, execution speed, deduplication metrics).

4. Implement Test Suite `tests/email-harvester-clusterer.test.mjs` using `node:test` and `node:assert/strict`:
   - Verify 1,000+ email generation & clustering pipeline.
   - Verify 100% PII redaction rate on sensitive test vectors.
   - Verify classification accuracy >= 98% on benchmark labeled sets.
   - Verify deduplication logic and edge cases (empty body, malformed headers, extreme PII, zero PII, nested threads, unicode, ambiguous categories, 100KB+ long emails).

5. Run test commands:
   - `node --test tests/email-harvester-clusterer.test.mjs`
   - `node --test tests/*.test.mjs`
   Ensure all tests pass with 0 failures.

6. Write your detailed report to `/Users/taboj/casa-tabor/.agents/sub_orch_m1/worker_1/report.md` and handoff report to `/Users/taboj/casa-tabor/.agents/sub_orch_m1/worker_1/handoff.md`.
7. Send message to parent orchestrator when complete.
