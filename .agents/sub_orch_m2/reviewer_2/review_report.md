# Milestone 2 Review Report: Empirical Evidence Report & Ground-Truth Benchmark

**Reviewer**: Reviewer 2 (Quality Review & Adversarial Critic)  
**Date**: August 23, 2026  
**Milestone**: M2 (Empirical Evidence Report & Ground-Truth Benchmark)  
**Verdict**: **APPROVE**  

---

## 1. Executive Summary

This independent quality and adversarial review examined the final deliverables for Milestone 2:
1. `docs/EMAIL_INTELLIGENCE_EMPIRICAL_REPORT.md` (Publication-grade Empirical Report)
2. `tests/fixtures/email-benchmark.json` (210 Gold-Standard Ground-Truth Benchmark Cases)
3. `scripts/email-benchmark-eval.mjs` (Standalone CLI Benchmark Evaluation Runner)
4. `tests/email-benchmark-verification.test.mjs` (Dedicated Benchmark Verification Suite)
5. `data/historical-email-corpus.json` (1,100 Ingestion Vectors & Semantic Clustering Data)
6. `tests/canonical-order-resolver.test.mjs` (Deterministic Entity & Order Normalizer Suite)

**Overall Assessment**: The deliverables exceed all acceptance criteria with exceptional engineering rigor, genuine pattern analysis, complete interface conformance, and 100% test pass rate with zero integrity violations.

---

## 2. Detailed Findings & Review Dimensions

### A. Empirical Evidence Report (`docs/EMAIL_INTELLIGENCE_EMPIRICAL_REPORT.md`)
- **1,100 Corpus Statistics**:
  - Ingestion vectors: 1,100 realistic family emails spanning 18 months of simulated history across 6 Gmail categories (Primary 220, Updates 330, Promotions 220, Travel 110, Finance 110, Forums 110).
  - Cluster distribution in `data/historical-email-corpus.json` verified: `logistics_parcels` (248, 22.5%), `executive_actions` (190, 17.3%), `temporal_appointments` (183, 16.6%), `lifecycle_updates` (158, 14.4%), `estate_knowledge` (166, 15.1%), `promotional_noise` (155, 14.1%).
  - Total corpus deduplication and clustering verified clean without loss or truncation.
- **7 Keyword Matching Failure Modes**:
  - Thoroughly analyzed in Section 5 with concrete before/after real-world scenarios:
    1. *Promotional "Action Required" Marketing Traps*: Addressed via 4-Zone weighted NLP scoring and discount token suppression.
    2. *Return Policy Disclaimer False Alarms*: Addressed via claim disclaimer isolation and negative lookbehind.
    3. *Passive Parcel Tracking Notification Escalation*: Addressed via strict delivery transit feed partitioning (`splitActionableAndTransitItems`).
    4. *Multi-Box Split Shipments*: Addressed via composite canonical thread keying (`transaction:<vendor>:<orderId>`).
    5. *Utility Outage vs. Past-Due Billing Disconnect*: Addressed via financial urgency priority scoring.
    6. *Rescheduled Event Duplication & Calendar Corruption*: Addressed via lifecycle in-place patching.
    7. *Multi-Hop Forwarded Threads & Embedded Fragments*: Addressed via recursive forward header unwrapper (`unwrapForwardedThread`).
- **Vendor Order Formats & Courier Specifications**:
  - Detailed in Section 4: Amazon (3-7-7, D01-), Walmart (7-8), Apple (W- prefix), Nike (C0- prefix), Target (10-14 digits), Jiffy (10 digits), HelloFresh (HF- prefix), Chewy (8-10 digits).
  - Courier tracking: UPS (1Z 18-char), FedEx (12/15/20/22 digits), USPS (20-24 digits and UPU S10), DHL Express (10 digits / GM eCommerce).
  - Composite thread key algebra rigorously defined for transactions, couriers, and perishable deliveries.
- **PII Redaction Engine**:
  - Section 6 documents 10 entity types: Luhn credit card PANs, SSNs, phone numbers, personal emails, street addresses, credentials/passwords, bank accounts, student/patient IDs, DOBs, and human names.
  - Verified genuine $O(n)$ Luhn checksum implementation with guards against false-positive order number redactions.
  - 5,364 injected PII tokens evaluated with 100% redaction and 0 leaks.
- **6x6 Confusion Matrix & Zero Action Leakage**:
  - 210 curated cases verified across all 6 archetypes (40 logistics, 38 actions, 36 appointments, 34 lifecycle, 32 estate, 30 noise).
  - 100% accuracy, 100% macro-F1 score, and strictly 0.00% action leakage into the "Needs You" executive action queue.

### B. Benchmark Dataset Schema & Evaluation Script
- **`tests/fixtures/email-benchmark.json`**:
  - Validated 210 distinct cases with complete schemas: `id`, `archetype`, `sender`, `subject`, `received_at`, `body`, `expected_agency_level`, `expected_canonical_key`, `expected_routing`, `expected_stage`, `expected_vendor`, `expected_carrier`, `expected_tracking_number`.
  - Balanced representation (all archetypes $\ge 30$ cases, well above the $\ge 25$ gate).
  - Preserves all 30 original golden cases (`BM-LOG-01..05`, `BM-ACT-01..05`, `BM-TEM-01..05`, `BM-LIF-01..05`, `BM-EST-01..05`, `BM-NOI-01..05`).
- **`scripts/email-benchmark-eval.mjs`**:
  - Standalone, zero-external-dependency ESM CLI tool supporting `--markdown`, `--json`, and `--verbose` flags.
  - Evaluates confusion matrix, precision/recall per archetype, agency level accuracy, zero action leakage, canonical order/tracking resolution, and latency percentiles.

---

## 3. Adversarial & Integrity Audit

| Check | Inspection Target | Result | Evidence |
|---|---|:---:|---|
| **No Hardcoded Cheats** | `supabase/functions/_shared/*`, `src/utils/*` | PASS | Ripgrep confirmation: 0 hardcoded `BM-` fixture IDs in classification/resolver logic |
| **No Facade Logic** | `email-clusterer.mjs`, `canonical-order-resolver.mjs` | PASS | Pure algorithmic implementations (Luhn, tokenizer, multi-zone scoring, stage state machine) |
| **No Shortcut Bypasses** | Benchmark verification test & CLI runner | PASS | True execution of `classifyEmail()`, `canonicalizeOrderId()`, `detectCarrierAndTracking()`, `splitActionableAndTransitItems()` |
| **PII False-Positive Guard** | Order vs CC numbers | PASS | Verified regexes protect Walmart `2000xxx-xxxxxxxx` and Amazon `xxx-xxxxxxx-xxxxxxx` from premature CC stripping |
| **Full Regression Safety** | Whole project test suite | PASS | 2,108 tests passing across 27 test files with 0 failures |

---

## 4. Test Verification Execution Log

1. `node scripts/email-benchmark-eval.mjs --markdown`:
   - Overall Classification Accuracy: **100%** (210/210)
   - Macro-Averaged F1 Score: **100%**
   - Routing Destination Accuracy: **100%**
   - Action Leakage to Needs You: **0 (0.00%)**
   - Order ID Canonicalization: **100%** (43/43)
   - Courier Tracking Canonicalization: **100%** (24/24)
   - Mean Classification Latency: **0.043 ms**
   - P95 Classification Latency: **0.175 ms**
   - Exit code: 0

2. `node --test tests/email-benchmark-verification.test.mjs`:
   - 8/8 tests pass (Fixture Integrity, Archetype Distribution, Vendor/Carrier Coverage, Preservation Mandate, Classification Gate, Action Leakage Mandate, Routing Gate, Entity Resolution).
   - Duration: 642 ms. Exit code: 0.

3. `node --test tests/canonical-order-resolver.test.mjs`:
   - 11/11 tests pass (Multi-vendor canonicalization, courier normalization, unstructured detection, composite keys, lifecycle lock, arrival date guardrail, courier auto-resolution, dynamic ETA, policy extraction, perishable detection, full contract conformance).
   - Duration: 65 ms. Exit code: 0.

4. `node --test tests/*.test.mjs`:
   - 2,108/2,108 tests pass across all 27 test files. 0 failures.

---

## 5. Review Verdict

**Verdict**: **APPROVE**  
The Milestone 2 Empirical Evidence Report and Ground-Truth Benchmark deliverables are complete, verified, mathematically consistent, adversarially robust, and ready for baseline governance across downstream Milestones (M3, M4, M5).
