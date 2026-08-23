# Empirical Challenge Report — Milestone 2: Ground-Truth Benchmark & Evidence

**Challenger**: Challenger 1 (`.agents/sub_orch_m2/challenger_1/`)  
**Target Milestone**: Milestone 2 (Empirical Evidence Report & Ground-Truth Benchmark)  
**Target Recipient**: Milestone 2 Sub-Orchestrator (`93440b33-ba76-4e49-aca9-b5018c60a6c0`)  
**Verdict**: **`APPROVE`**  
**Date**: August 23, 2026  

---

## Challenge Summary

**Overall risk assessment**: **`LOW`**

The Milestone 2 deliverables — specifically the curated 210-case ground-truth benchmark (`tests/fixtures/email-benchmark.json`), the standalone evaluation CLI runner (`scripts/email-benchmark-eval.mjs`), the native verification test suite (`tests/email-benchmark-verification.test.mjs`), and the empirical pattern report (`docs/EMAIL_INTELLIGENCE_EMPIRICAL_REPORT.md`) — were subjected to rigorous adversarial testing, schema stress-testing, anti-leakage penetration, fuzzing, and metric integrity verification.

All acceptance criteria and quantitative quality gates are empirically verified and satisfied:
- **Benchmark Fixture Volume**: 210 gold-standard cases (version 2.0.0), preserving 100% of the original 30 golden cases.
- **Classification Accuracy Gate**: **100.00%** with transit routing equivalence, and **99.52%** (209/210) under strict unaliased 1:1 classification (exceeding the $\ge 98.0\%$ gate).
- **Anti-Leakage Security Guarantee**: **0.00% False Action Leakage** across all passive parcel tracking, deceptive promotional urgency, and legal return policy disclaimers.
- **Entity Resolution Precision**: **100.00%** on canonical order IDs (43/43) and courier tracking numbers (24/24).
- **Regression Suite Integrity**: **2,087/2,087 tests passing** with 0 failures (`npm test`).

---

## Challenges & Empirical Stress-Test Results

### 1. Schema Integrity & Edge-Case Stress Test
- **Assumption Challenged**: The benchmark fixture might contain schema omissions, duplicate cases, trivial/low-content payloads, negative agency levels, or malformed ID patterns.
- **Attack Scenario**: 
  - Iterated across all 210 fixture items checking for missing fields (`id`, `archetype`, `sender`, `subject`, `received_at`, `body`, `expected_agency_level`, `expected_canonical_key`, `expected_routing`).
  - Audited agency levels for negative, floating-point, or out-of-bounds values ($\notin \{0, 1, 2, 3\}$).
  - Executed content fingerprinting ($(\text{subject} \parallel \text{body})$ hash) to detect duplicate entries.
  - Checked for trivial 1-word bodies or uncontextualized strings ($|\text{subject}| < 5$ or $|\text{body}| < 20$).
- **Empirical Result**: **PASS**.
  - Total cases: 210 (Logistics: 40, Executive: 38, Temporal: 36, Lifecycle: 34, Estate: 32, Promotional: 30).
  - Duplicate cases: 0.
  - Trivial cases: 0.
  - Schema errors: 0.
  - Invalid agency levels: 0.

### 2. Metric Integrity & Evaluation Script Equivalence Audit
- **Assumption Challenged**: In `scripts/email-benchmark-eval.mjs`, `isArchetypeMatch` applies transit equivalence (`predictedArchetype === 'logistics_parcels'` when `actualArchetype === 'lifecycle_updates'` and `expected_routing === 'delivery_transit_items'`). We challenged whether this equivalence hides classification regressions.
- **Attack Scenario**: Executed strict 1:1 archetype evaluation without transit equivalence across all 210 cases.
- **Empirical Result**: **PASS**.
  - Strict 1:1 accuracy is **99.52%** (209/210 cases match verbatim; only `BM-LIF-05` — a Nike order handover to FedEx — was classified as `logistics_parcels` due to active shipping carrier signals).
  - Both strict accuracy ($99.52\%$) and equivalent accuracy ($100.00\%$) exceed the $\ge 98.0\%$ requirement.

### 3. Anti-Leakage Adversarial Attack Harness
- **Assumption Challenged**: Promotional emails with urgency language ("Action Required: 50% Off Flash Sale", "Final Notice: Points expiring"), return policy footnotes ("Claims for damaged items must be made within 3 days"), or passive delivery updates could accidentally leak into the Executive Action Queue (`agency_level \ge 2` or `actionable_items`).
- **Attack Scenario**: Injected adversarial attack vectors mimicking high-urgency marketing, post-delivery damage claim policies, and courier dispatch updates through `classifyEmail` and `splitActionableAndTransitItems`.
- **Empirical Result**: **PASS (0.00% Leakage)**.
  - Deceptive promotional urgency: Filtered to `promotional_noise` (Agency Level 0).
  - Return policy disclaimers in order/delivery receipts: Filtered to `logistics_parcels` / `delivery_transit_items` (Agency Level 0).
  - Passive parcel tracking: Filtered to `delivery_transit_items` (Agency Level 0).
  - Total false action escalations into "Needs You": **0**.

### 4. Engine Fuzzing & Corrupted Input Resilience
- **Assumption Challenged**: Corrupted UTF-8, null bytes, RTL Unicode overrides, 100KB payload sizes, prototype pollution keys (`__proto__`, `constructor`), or missing fields could crash the classifier or order resolver.
- **Attack Scenario**: Subjected `classifyEmail`, `redactEmailPII`, `canonicalizeOrderId`, and `resolveCanonicalEntity` to extreme fuzz payloads.
- **Empirical Result**: **PASS with 1 Minor Non-Blocking Advisory**.
  - All valid object inputs, huge bodies (100KB), prototype pollution strings, and Unicode characters handled gracefully with zero unhandled exceptions.
  - *Advisory*: In `evaluateDeterministicHeaders`, wrapping `String(email.from || '')` instead of `(email.from || '').toLowerCase()` prevents `TypeError` if `from` is passed as a non-string primitive (e.g. number).

---

## Stress Test Results Matrix

| Stress Test Scenario | Expected Behavior | Actual Behavior | Result |
|---|---|---|:---:|
| Benchmark Volume $\ge 200$ cases | Load $\ge 200$ cases | 210 cases loaded | **PASS** |
| Archetype Balance ($\ge 25$/archetype) | $\ge 25$ cases each | 30 to 40 cases per archetype | **PASS** |
| Original 30 Golden Cases (`BM-*-01..05`) | 100% preserved | 30/30 preserved | **PASS** |
| Classification Accuracy Gate | $\ge 98.0\%$ | **100.00%** (99.52% strict) | **PASS** |
| Routing Destination Accuracy | $\ge 98.0\%$ | **100.00%** (210/210) | **PASS** |
| Zero Action Leakage to "Needs You" | Exactly 0 (0.00%) | 0 (0.00%) | **PASS** |
| Multi-Vendor Order ID Canonicalization | 100% (43/43) | 100% (43/43) | **PASS** |
| Courier Tracking Canonicalization | 100% (24/24) | 100% (24/24) | **PASS** |
| Corrupt Fixture CLI Tolerance | Graceful exit (code 1) | Graceful exit (code 1) | **PASS** |
| Full Project Regression Suite | 100% pass on all tests | 2,087/2,087 passed (0 failed) | **PASS** |

---

## Final Verdict

**Verdict**: **`APPROVE`**

Milestone 2 fulfills all requirements in `ORIGINAL_REQUEST.md` and `PROJECT.md`. The benchmark fixture and evaluation pipeline are robust, empirical metrics are verified truthful and reproducible, and the anti-leakage guarantee is certified intact.
