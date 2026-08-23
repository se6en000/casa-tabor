# Project Plan: Casa Tabor Autonomous Household Email Intelligence System

## Objective
Deliver a production-ready, autonomous, self-learning household email intelligence system with >=98% benchmark accuracy, 0% noise leakage to executive action queues, deterministic multi-vendor order & tracking reconciliation, omnichannel kiosk compatibility, and 100% pass on all 1,698+ existing regression tests.

## Phase Breakdown

### Phase 0: Survey & Technical Investigation (Parallel Explorers)
- Map existing email ingestion pipeline, Gmail integrations, database schema (`household_capture_rules`, orders, parcels, tasks, calendar), test framework, and kiosk UI.
- Synthesize findings into `PROJECT.md § Feature Inventory` and architecture contracts.

### Phase 1: Historical Corpus Harvester & Semantic Clusterer (R1)
- Discover and cluster 1,000+ real family emails into 6 semantic archetypes (Logistics, Executive Action, Temporal, Lifecycle, Estate Context, Promotional Noise) with PII anonymization.

### Phase 2: Empirical Evidence Report & Ground-Truth Benchmark (R2)
- Build 200+ curated benchmark holdout test cases at `tests/fixtures/email-benchmark.json`.
- Publish comprehensive empirical evidence report covering edge cases and pattern nuances.

### Phase 3: Deterministic Entity & Canonical Order Resolver (R3)
- Multi-vendor order normalization (Walmart, Amazon, Target, Apple, Nike, Jiffy, HelloFresh).
- Multi-carrier tracking number resolution (UPS, FedEx, USPS, DHL) with composite thread keying.

### Phase 4: Autonomous Active-Learning Ingestion Engine (R4)
- Compound Decomposer (multi-intent newsletters, flyer decomposition into tasks & calendar events).
- Dynamic Few-Shot Exemplar Store with runtime relevance retrieval.
- Active Feedback Loop learning from user dismissals, voice directives, and persisting into `household_capture_rules`.

### Phase 5: Verification Harness & Omnichannel Kiosk Integration (R5 & E2E Final Milestone)
- E2E evaluation runner against `tests/fixtures/email-benchmark.json` (>=98% accuracy, 0% leakage).
- Kiosk UX integration verifying 3-click navigation constraint and touch readiness.
- Full regression verification across all 1,698+ tests with 0 failures.
