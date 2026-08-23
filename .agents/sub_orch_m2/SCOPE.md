# Scope: Milestone 2 — Empirical Evidence Report & Ground-Truth Benchmark

## Architecture & Responsibilities
- Input sources:
  - `data/historical-email-corpus.json`: Raw/historical emails (1,100 items across diverse vendors, accounts, personal/HOA/school/utility emails).
  - `supabase/functions/_shared/email-clusterer.mjs`: Extractor/classifier/clusterer implementation from M1.
  - `PROJECT.md` & `ORIGINAL_REQUEST.md`: Master specs, 6 archetypes, agency levels (0-3), routing destinations, vendor patterns, regex rules.
- Outputs & Deliverables:
  1. `tests/fixtures/email-benchmark.json`:
     - 210 distinct benchmark cases (version 2.0.0).
     - Covers 6 archetypes: `logistics_parcels` (40), `executive_actions` (38), `temporal_appointments` (36), `lifecycle_updates` (34), `estate_knowledge` (32), `promotional_noise` (30).
     - Preserves all 30 legacy golden cases (`BM-LOG-01..05`, `BM-ACT-01..05`, `BM-TEM-01..05`, `BM-LIF-01..05`, `BM-EST-01..05`, `BM-NOI-01..05`).
     - Fields: `id`, `archetype`, `sender`, `subject`, `date`, `body`, `expected_routing`, `expected_agency_level`, `expected_canonical_key`, `expected_stage`, `expected_policy_disclaimer`, and entity fields.
  2. `docs/EMAIL_INTELLIGENCE_EMPIRICAL_REPORT.md`:
     - Publication-grade empirical report (353 lines) grounded in the 1,100 corpus and 210 benchmark cases.
     - Real patterns across 1,100+ emails.
     - Nuanced vendor formats: Amazon 3-7-7, Walmart 7-8/15-16 digit, Apple W-order, Nike C0-order, Jiffy, HelloFresh, Target, UPS/FedEx/USPS/DHL.
     - Failure modes of naive keyword matching (7 deep failure modes documented with verbatim examples and mitigations).
     - Classification accuracy, 6x6 confusion matrix, precision/recall per archetype, latency metrics, and PII sanitization.
  3. `tests/email-benchmark-verification.test.mjs`:
     - Unit test verifying all 210 cases schema validity, non-empty fields, unique IDs, archetype/routing/agency level conformance, 0% action leakage, and 100% entity canonicalization.
  4. `scripts/email-benchmark-eval.mjs`:
     - Standalone ESM CLI evaluation runner to execute benchmark evaluation, calculate confusion matrix, and format report metrics (`--json`, `--markdown`, `--verbose`, `--fixture`).

## Milestones & Status
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M2.1 | Corpus & Spec Exploration | Deep analysis of 1,100+ corpus, schema requirements, vendor regex patterns | M1 Complete | DONE |
| M2.2 | Benchmark Dataset & Verification Test | Generate 210 benchmark cases in `tests/fixtures/email-benchmark.json` and verification test | M2.1 | DONE |
| M2.3 | Evaluation Script & Empirical Report | Build `scripts/email-benchmark-eval.mjs` and write `docs/EMAIL_INTELLIGENCE_EMPIRICAL_REPORT.md` | M2.2 | DONE |
| M2.4 | Review, Adversarial Challenge & Forensic Audit | Verification with 2 Reviewers, 2 Challengers, and Forensic Auditor | M2.3 | DONE |

## Code Layout Ownership
- `tests/fixtures/email-benchmark.json`
- `docs/EMAIL_INTELLIGENCE_EMPIRICAL_REPORT.md`
- `tests/email-benchmark-verification.test.mjs`
- `scripts/email-benchmark-eval.mjs`
