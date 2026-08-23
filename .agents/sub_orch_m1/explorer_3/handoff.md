# Handoff Report: Milestone 1 — 1,000+ Email Corpus Generation & Test Suite Methodology

**Author**: Explorer 3 (Milestone 1 — Historical Corpus Harvester & Semantic Clusterer)  
**Date**: 2026-08-23T11:49:30Z  
**Recipient**: Sub-Orchestrator M1 (`bb0d3442-97e2-4840-9e74-a4079743336d`)

---

## 1. Observation
1. **Test Runner & Package Config**:
   - In `package.json:9`, the test command is defined as `"test": "node --test tests/*.test.mjs"`. All 115 test files in `tests/` use standard Node.js `node:test` and `node:assert/strict`.
2. **Canonical RFC & Fallback Keying**:
   - In `supabase/functions/_shared/gmail-canonical-email.mjs:34-56`, `canonicalEmailKey()` hashes `rfc:${messageId}` if present, or falls back to `fallback:${sha256(sender + subject + tenMinuteBucket + normalizedBody)}`.
   - In `tests/gmail-canonical-email.test.mjs:9-57`, cross-inbox RFC deduplication and fallback deduplication within a 10-minute window are verified.
3. **Existing Evidence Classification & Redaction**:
   - In `supabase/functions/_shared/family-email-evidence.mjs:1-49`, initial category patterns and rudimentary credential redactions exist for forms, payments, orders, athletics, and schools.
4. **Milestone 1 Requirements**:
   - In `.agents/sub_orch_m1/SCOPE.md:4-16` and `ORIGINAL_REQUEST.md:12-20`, the pipeline must harvest and cluster 1,000+ emails across Primary, Updates, and Promotions into the 6 household archetypes (`logistics_parcels`, `executive_actions`, `temporal_appointments`, `lifecycle_updates`, `estate_knowledge`, `promotional_noise`).
   - In `PROJECT.md:41-47`, the system mandates >= 95% (target >= 98%) benchmark accuracy and 0% false leakage of passive return policies or tracking into Executive Action queues.

---

## 2. Logic Chain
1. *From Observation 1*: The test suite for Milestone 1 must be located at `tests/email-harvester-clusterer.test.mjs` so that `npm test` automatically executes it alongside all 1,698 existing tests without introducing new runner dependencies.
2. *From Observation 2 & 4*: To test cross-mailbox deduplication across family accounts (e.g., Mom and Dad both receiving school announcements or order confirmations), the synthetic generator must produce paired messages sharing identical RFC `Message-ID`s or identical fallback content.
3. *From Observation 3 & 4*: Standard testing on static mock data is insufficient for certifying 100% PII redaction and 0 unclassified errors at scale. A deterministic seeded synthetic generator (1,100 emails across 32 senders and 4 Gmail categories) with injected seed PII tokens is required to rigorously test redaction without privacy violations.
4. *From Observation 4*: The test suite must assert 7 specific gates: scale (>=1,000 emails), 100% PII redaction on seed tokens, 0 unclassified / fallback errors across all 6 archetypes, >95% accuracy on labeled holdout cases, 0% passive logistics leakage into executive actions, cross-mailbox deduplication, and high throughput (<1,500ms).

---

## 3. Caveats
- **Live Gmail API Rate Limits**: While the synthetic generator runs instantaneously offline, live Gmail API batch harvesting across real mailboxes in production is subject to Google API quotas (250 quota units/sec, 15,000/min). The harvesting script must implement chunked batching (e.g. batch size of 50) with exponential backoff.
- **Assumed Seed PII Token Coverage**: The 100% PII redaction test uses deterministic seed tokens (names, SSNs, phone numbers, credit card numbers, street addresses). Real-world unstructured human emails may contain unusual nicknames or abbreviations that require ongoing dictionary expansion.

---

## 4. Conclusion
The comprehensive design for the 1,000+ Email Corpus Generator and Test Suite Methodology has been completed and documented in `/Users/taboj/casa-tabor/.agents/sub_orch_m1/explorer_3/report.md`. 
The Phase 2 Worker can directly implement:
1. `scripts/harvest-historical-email-corpus.mjs` (synthetic generator + Gmail harvesting CLI)
2. `supabase/functions/_shared/email-clusterer.mjs` (clustering & PII redaction engine)
3. `tests/email-harvester-clusterer.test.mjs` (7-suite automated verification harness)

---

## 5. Verification Method
1. **Inspect Design Report**: Review `/Users/taboj/casa-tabor/.agents/sub_orch_m1/explorer_3/report.md` for the complete synthetic schema, category distributions, edge-case injection patterns, and test specifications.
2. **Execute Existing Test Suite**: Run `npm test` to verify current regression safety (115 files passing).
3. **Worker Implementation Verification (Post-Phase 2)**:
   - Run `node --test tests/email-harvester-clusterer.test.mjs`
   - Run `node scripts/harvest-historical-email-corpus.mjs --synthetic --count=1100 --seed=42`
   - Verify 0 test failures, 100% PII redaction, 0 unclassified emails, and >95% accuracy on labeled benchmark.
