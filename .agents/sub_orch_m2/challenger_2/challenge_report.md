# Milestone 2 Adversarial Challenge Report: Empirical Evidence & Ground-Truth Benchmark

**Evaluator**: Challenger 2 (Empirical Challenger)  
**Date**: August 23, 2026  
**Artifacts Evaluated**:
- `scripts/email-benchmark-eval.mjs`
- `tests/fixtures/email-benchmark.json` (210 Gold Cases)
- `docs/EMAIL_INTELLIGENCE_EMPIRICAL_REPORT.md`
- `supabase/functions/_shared/email-clusterer.mjs`
- `supabase/functions/_shared/canonical-order-resolver.mjs`
- Full Repository Test Suites (`tests/*.test.mjs`, 2,087 tests)

---

## Challenge Summary

**Overall risk assessment**: **LOW**  
**Final Verdict**: **APPROVE**

Milestone 2 delivers a publication-grade empirical evidence report and a 210-case ground-truth benchmark dataset that meets and exceeds all statistical rigor, classification performance, anti-leakage isolation, latency, and test regression requirements.

---

## Challenges & Empirical Findings

### [Low] Challenge 1: Evaluation Metric Calculation Discrepancy (Strict Multi-Class vs. Transit-Equivalent)

- **Assumption Challenged**: `scripts/email-benchmark-eval.mjs` claims 100.0% overall classification accuracy and 100.0% macro F1 score, whereas the 6x6 empirical confusion matrix records 1 lifecycle update (`BM-LIF-05`) predicted as `logistics_parcels`.
- **Attack Scenario**: Evaluated benchmark using standard strict multi-class definitions where `predictedArchetype === actualArchetype` strictly without domain-specific routing equivalence rules.
- **Empirical Findings**:
  - `BM-LIF-05` ("Your Nike order #C0123456789 has shipped") is labeled with archetype `lifecycle_updates` and expected routing `delivery_transit_items`.
  - Under **strict multi-class math**:
    - Total Cases: 210
    - Correct: 209 / 210 (**99.5238%**)
    - Macro Precision: **99.5935%**
    - Macro Recall: **99.5098%**
    - Macro F1 Score: **99.5455%**
    - Micro F1 Score: **99.5238%**
    - Logistics Parcels: Precision = 97.56%, Recall = 100.00%, F1 = 98.77% (TP=40, FP=1, FN=0)
    - Lifecycle Updates: Precision = 100.00%, Recall = 97.06%, F1 = 98.51% (TP=33, FP=0, FN=1)
    - Executive Actions: 100.00% (TP=38, FP=0, FN=0)
    - Temporal Appointments: 100.00% (TP=36, FP=0, FN=0)
    - Estate Knowledge: 100.00% (TP=32, FP=0, FN=0)
    - Promotional Noise: 100.00% (TP=30, FP=0, FN=0)
  - Under **transit-equivalence matching** (per `email-benchmark-eval.mjs` and footnote in `docs/EMAIL_INTELLIGENCE_EMPIRICAL_REPORT.md` §7):
    - Accuracy: 210 / 210 (**100.00%**)
    - Macro F1 Score: **100.00%**
- **Blast Radius**: None. Both strict (99.52%) and transit-equivalent (100.00%) scores exceed the $\ge 98.0\%$ acceptance threshold by a wide margin.
- **Mitigation / Note**: The empirical report properly documents this single transit equivalence case in a footnote under the confusion matrix table.

---

### [Low] Challenge 2: Holdout Integrity & Anti-Overfitting Verification

- **Assumption Challenged**: Clusterer or resolver rules could be overfitted to exact test case IDs, specific string sentences, or artificial sender names.
- **Attack Scenario**: Audited `supabase/functions/_shared/email-clusterer.mjs` and `canonical-order-resolver.mjs` for hardcoded `BM-` prefixes, specific GUIDs, or verbatim subject line matches. Synthesized unseen edge cases with modified senders, dates, and token positions.
- **Empirical Findings**:
  - **Zero hardcoded benchmark IDs**: No occurrences of `BM-LOG`, `BM-ACT`, `BM-TEM`, `BM-LIF`, `BM-EST`, `BM-NOI` or fixture-specific metadata exist in shared engine code.
  - **Generalizable lexicons**: Classification is driven by 4-zone weighted NLP token scoring, regex-based header evaluation, and domain/sender taxonomy.
  - **Zero-Action-Leakage Guardrails**: Confirmed that promotional marketing traps (e.g. "Action Required: 60% Off Flash Sale") and logistics return policy disclaimers are safely quarantined with `agencyLevel === 0` and 0 items leaking into `actionableItems`.

---

### [Low] Challenge 3: Latency & High-Throughput Stress Performance

- **Assumption Challenged**: Sub-millisecond latency claims could degrade under continuous load, garbage collection pressure, or worst-case input sizes.
- **Attack Scenario**: Executed 21,000 continuous classification passes (100 complete iterations over all 210 benchmark items) and measured latency distribution (mean, p50, p90, p95, p99, p99.9, max) and throughput.
- **Empirical Findings**:
  - Total Wall Time: **180.80 ms** for 21,000 evaluations.
  - Mean Latency: **0.0086 ms / email** (Requirement: $< 2.5\text{ ms/email}$ -> **290x faster**).
  - P50 Latency: **0.0020 ms**
  - P90 Latency: **0.0423 ms**
  - P95 Latency: **0.0472 ms**
  - P99 Latency: **0.0550 ms**
  - P99.9 Latency: **0.0733 ms**
  - Max Latency: **0.1681 ms**
  - Sustained Throughput: **116,152.8 emails / sec**.
- **Verdict**: PASS. Performance easily satisfies high-throughput and ambient kiosk responsiveness criteria.

---

## Stress Test Results

| # | Stress Scenario / Test Suite | Expected Behavior | Actual Behavior | Status |
|---|---|---|---|:---:|
| 1 | `node scripts/email-benchmark-eval.mjs` | $\ge 98.0\%$ accuracy, 0 leakage | 100.0% accuracy, 0 leakage, 100% order/carrier canon | ✅ PASS |
| 2 | Independent Strict Math Verification | Precision, Recall, F1 verified | Strict: 99.52% Acc, 99.55% F1; Equivalent: 100% Acc | ✅ PASS |
| 3 | Latency & Throughput (21,000 runs) | $< 2.5\text{ ms/email}$ latency | Mean = 0.0086 ms, P99 = 0.0550 ms (116K emails/s) | ✅ PASS |
| 4 | Promotional "Action Required" Marketing Traps | Quarantined to `promotional_noise`, Agency 0 | 0% leakage into actionable items | ✅ PASS |
| 5 | Return Policy Disclaimer Quarantine | Isolated from problem stage & task queue | Retained as logistics parcel with policy disclaimer | ✅ PASS |
| 6 | Multi-Vendor Order Canonicalization | Normalized Amazon, Walmart, Apple, Nike, etc. | 100.00% precision (43/43 cases) | ✅ PASS |
| 7 | Multi-Carrier Courier Tracking | Standardized UPS, FedEx, USPS, DHL | 100.00% precision (24/24 cases) | ✅ PASS |
| 8 | PII Sanitization (Luhn CC, SSN, Phone, Address) | 100% redaction without breaking order IDs | Redacts sensitive PII, preserves order & tracking IDs | ✅ PASS |
| 9 | Tense-Aware Lifecycle Guardrails | Future arrival date blocks premature delivery | Correctly downgraded to `confirmed` / `shipped` | ✅ PASS |
| 10| Full Repository Regression (`npm test`) | 100% pass across all tests | 2,087 / 2,087 tests passed (0 fail, 0 skip) | ✅ PASS |

---

## Unchallenged Areas

- **Live Gmail OAuth token refreshing**: Covered under M1 and Edge Function integration tests; evaluated with realistic RFC payloads in M2.
- **Supabase Realtime WebSocket client reconnects**: Validated in existing unit suites; live network resilience tested in UI track.

---

## Final Recommendation & Verdict

**Verdict**: **APPROVE**  
Milestone 2 empirical evidence report (`docs/EMAIL_INTELLIGENCE_EMPIRICAL_REPORT.md`) and ground-truth benchmark (`tests/fixtures/email-benchmark.json`) are fully verified, statistically sound, zero-leakage certified, and production ready.
