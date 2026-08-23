# Handoff Report: Milestone 2 Specification Mining & Schema Contracts

**Agent**: Spec Miner (`spec_miner_1`)  
**Milestone**: Milestone 2 — Empirical Evidence Report & Ground-Truth Benchmark  
**Working Directory**: `/Users/taboj/casa-tabor/.agents/sub_orch_m2/spec_miner_1/`  
**Date**: 2026-08-23T12:13:00Z  

---

## 1. Observation

Direct observations from authoritative project sources:

1. **User Request & Master Architecture (`ORIGINAL_REQUEST.md:21-22, 38-42`, `PROJECT.md:13, 33-34, 53`)**:
   - `ORIGINAL_REQUEST.md` line 21-22: *"R2. Empirical Evidence Report & Ground-Truth Benchmark: Deliver a comprehensive, evidence-grounded empirical report documenting real email patterns, common edge cases, failure modes of naive keyword matching, and a validated 200+ email ground-truth holdout benchmark dataset with labeled expected routing, extracted fields, and agency levels."*
   - `ORIGINAL_REQUEST.md` line 40: *"Ground-truth holdout benchmark dataset (200+ curated test cases) created and checked into `tests/fixtures/email-benchmark.json`."*
   - `PROJECT.md` line 13: *"Empirical Evidence & Benchmark Dataset: Curated holdout benchmark (`tests/fixtures/email-benchmark.json`) with 200+ gold-standard cases, labeled routing, agency levels, canonical keys, and empirical pattern documentation."*
   - `PROJECT.md` line 33-34: Feature 3 (*Empirical Evidence Report*) and Feature 4 (*200+ Ground-Truth Benchmark Holdout Dataset*).

2. **Existing Fixture State (`tests/fixtures/email-benchmark.json`)**:
   - Currently contains 30 test cases (`BM-LOG-01..05`, `BM-ACT-01..05`, `BM-TEM-01..05`, `BM-LIF-01..05`, `BM-EST-01..05`, `BM-NOI-01..05`).
   - Fields used in fixture: `id`, `archetype`, `sender`, `subject`, `received_at`, `body`, `expected_agency_level`, `expected_vendor`, `expected_canonical_order_id`, `expected_tracking_number`, `expected_carrier`, `expected_stage`, `expected_is_perishable`, `expected_routing`, `expected_due_by`, `expected_assigned_member`, `expected_cost`, `expected_event_title`, `expected_start_time`, `expected_location`, `expected_conflict_detected`.

3. **Historical Corpus State (`data/historical-email-corpus.json`, `scripts/harvest-historical-email-corpus.mjs`)**:
   - Contains 1,100 deduplicated synthetic emails generated from 32 realistic household sender domains.
   - Categorized into 6 archetypes with PII redaction statistics (Names: 359, Phones: 338, Personal Emails: 338, Addresses: 338, Credit Cards: 338, Bank Accounts: 24, SSNs: 27, Credentials: 24, Total Redactions: 1786).

4. **Classifier Engine & Guardrail Mechanics (`supabase/functions/_shared/email-clusterer.mjs:9-16, 907-943, 1045-1075`)**:
   - Lines 9-16 define `SEMANTIC_ARCHETYPES` array: `['logistics_parcels', 'executive_actions', 'temporal_appointments', 'lifecycle_updates', 'estate_knowledge', 'promotional_noise']`.
   - Lines 907-943 isolate retailer marketing deals vs transactional updates.
   - Lines 1048-1075 enforce Anti-Leakage Guardrails:
     - Guardrail 1: Retains passive return policies / claims window in `logistics_parcels` (`agency_level: 0`).
     - Guardrail 2: Retains promotional urgency ("Action Required: 40% Off") in `promotional_noise`.
     - Guardrail 3: Lifecycle state priority over static logistics.

5. **Existing Test Verifications (`tests/email-harvester-clusterer.test.mjs`, `tests/e2e-email-intelligence-tiers.test.mjs`)**:
   - `node --test tests/email-harvester-clusterer.test.mjs` exits 0 (20/20 tests passing in 184ms).
   - `node --test tests/e2e-email-intelligence-tiers.test.mjs` exits 0 (105/105 tests passing in 732ms).

---

## 2. Logic Chain

1. **Step 1: Benchmark Dataset Expansion Scope**:
   - `ORIGINAL_REQUEST.md` and `PROJECT.md` require $\ge 200$ curated ground-truth cases checked into `tests/fixtures/email-benchmark.json`.
   - The schema must preserve backward compatibility with existing tests in `tests/e2e-email-intelligence-tiers.test.mjs` (which validates `BM-LOG-01..05`, `BM-ACT-01..05`, etc.) while extending the dataset with 180+ new diverse cases covering the 6 archetypes, 7+ major vendors, 4 courier carriers, edge cases (Unicode, multi-hop forwards, extreme IDs), and agency levels 0-3.

2. **Step 2: Schema & Attribute Conformance**:
   - Every benchmark item must include:
     - `id`: unique ID string (`BM-LOG-01` .. `BM-LOG-40`, `BM-ACT-01` .. `BM-ACT-40`, `BM-TEM-01` .. `BM-TEM-40`, `BM-LIF-01` .. `BM-LIF-35`, `BM-EST-01` .. `BM-EST-35`, `BM-NOI-01` .. `BM-NOI-35`).
     - `archetype`: 1 of the 6 canonical archetypes.
     - `sender`, `subject`, `received_at`, `body`.
     - `expected_agency_level`: integer in $[0, 3]$.
     - `expected_routing`: target system destination (`delivery_transit_items`, `actionable_items`, `suggested_events`, `lifecycle_patches`, `family_knowledge_claims`, `family_data_documents`, `skip_noise`).
     - Optional entity fields: `expected_canonical_key`, `expected_vendor`, `expected_canonical_order_id`, `expected_tracking_number`, `expected_carrier`, `expected_stage`, `expected_policy_disclaimer`, `expected_is_perishable`, `expected_due_by`, `expected_cost`, `expected_assigned_member`, `expected_event_title`, `expected_start_time`, `expected_location`, `expected_conflict_detected`.

3. **Step 3: Empirical Report Blueprint (`docs/EMAIL_INTELLIGENCE_EMPIRICAL_REPORT.md`)**:
   - Must comprehensively synthesize evidence from the 1,100-email historical corpus (`data/historical-email-corpus.json`) and the 200+ benchmark dataset.
   - Must include: Executive Summary, Corpus Ingestion Metrics, 6-Archetype Semantic Taxonomy Matrix, Naive Keyword Failure Modes (with verbatim examples and mitigation logic), Vendor Normalization Nuances, PII Redaction Audit (10 entity types), 6x6 Confusion Matrix and Precision/Recall/F1 metrics, and Omnichannel Kiosk Touch UX Guarantees (0% false leakage).

4. **Step 4: Verification & Evaluation Script Deliverables**:
   - `scripts/email-benchmark-eval.mjs`: Standalone CLI tool calculating confusion matrix, accuracy, precision, recall, and zero-leakage compliance.
   - `tests/email-benchmark-verification.test.mjs`: Native test suite executing assertions for $>200$ cases, schema validity, $\ge 98\%$ classification accuracy, and $0$ action leakage.

---

## 3. Caveats

1. **Archetype Naming Aliases**:
   - The internal engine in `email-clusterer.mjs` uses `logistics_parcels`, `executive_actions`, `temporal_appointments`, `lifecycle_updates`, `estate_knowledge`, `promotional_noise`.
   - The user request mentions human-readable archetype names (`estate_logistics_and_ecom`, `executive_action_and_financial`, `calendar_and_commitments`, `estate_knowledge_and_governance`, `communications_and_social`, `noise_and_promotions`).
   - The benchmark schema and empirical report document both canonical technical keys and human-readable aliases.
2. **Deterministic Offline Execution**:
   - All evaluation scripts and tests must run in pure ESM mode with zero external network or LLM API calls, completing in $<2$ seconds.

---

## 4. Conclusion

The authoritative specifications, schemas, archetype taxonomies, entity resolution patterns, failure modes, report structure, and test requirements for Milestone 2 are fully mined, verified against the codebase, and documented in detail in `spec_analysis.md`. The orchestrator and workers can proceed directly to generate the 200+ case benchmark dataset, write the empirical evidence report, and build the evaluation runner and verification suite.

---

## 5. Verification Method

To independently verify the specification mining findings:

1. Inspect the detailed specification analysis:
   - `view_file` on `/Users/taboj/casa-tabor/.agents/sub_orch_m2/spec_miner_1/spec_analysis.md`
2. Verify existing test suite baseline:
   - Command: `node --test tests/email-harvester-clusterer.test.mjs` (Expect 20 passing)
   - Command: `node --test tests/e2e-email-intelligence-tiers.test.mjs` (Expect 105 passing)
3. Check corpus and fixture existence:
   - Inspect `/Users/taboj/casa-tabor/data/historical-email-corpus.json` (1,100 emails)
   - Inspect `/Users/taboj/casa-tabor/tests/fixtures/email-benchmark.json`
