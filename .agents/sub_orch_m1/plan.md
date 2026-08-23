# Plan: Milestone 1 — Historical Corpus Harvester & Semantic Clusterer

## Iteration 1 Plan

### Phase 1: Parallel Exploration (3 Explorers)
- **Explorer 1 (Codebase & Corpus Architecture)**: Investigate existing project structure in `/Users/taboj/casa-tabor`, existing scripts, supabase/sqlite/json store patterns, Gmail API integrations, token management, schema definitions.
- **Explorer 2 (Clustering Algorithm & PII Redaction)**: Investigate regex/NER/heuristic PII redaction (names, phones, emails, addresses, credit cards, account numbers) and deterministic/NLP semantic clustering for the 6 archetypes.
- **Explorer 3 (Synthetic Corpus & Test Methodology)**: Investigate realistic 1,000+ synthetic email corpus generation spanning Primary, Updates, Promotions with realistic edge cases, test runner setup, and verification criteria.

### Phase 2: Implementation (1 Worker)
- Dispatch Worker with unified specification, explicit file boundaries, and integrity rules.
- Implement:
  1. `lib/email-clustering.ts` / `_shared/email-clusterer.mjs`
  2. `scripts/harvest-historical-email-corpus.mjs`
  3. `tests/email-harvester-clusterer.test.mjs`
- Worker executes tests and reports metrics.

### Phase 3: Verification & Review (2 Reviewers)
- Reviewer 1: Correctness, PII security, schema compliance, error handling.
- Reviewer 2: Clustering accuracy, performance on 1,000+ items, edge case resilience.

### Phase 4: Adversarial Verification (2 Challengers)
- Challenger 1: Generates adversarial emails, PII leakage probes, unicode fuzzing, ambiguous category edge cases.
- Challenger 2: Scale/throughput testing on 2,000+ items, distribution stability, archetype confusion matrix verification.

### Phase 5: Forensic Integrity Audit (1 Auditor)
- Rigorous check against cheating, hardcoding, facade tests, synthetic shortcuts.

### Phase 6: Gate Evaluation & Handoff
- Evaluate all verdicts in `GATE_STATUS.md`.
- If pass, write `handoff.md` and report to parent.
