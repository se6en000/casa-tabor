# E2E Review Report: Autonomous Household Email Intelligence System

**Reviewer**: Reviewer 1 (`e2e_reviewer_1`)  
**Roles**: Reviewer & Adversarial Critic  
**Date**: 2026-08-23T11:54:30Z  
**Verdict**: `REQUEST_CHANGES`

---

## 1. Review Summary

- **Verdict**: `REQUEST_CHANGES`
- **Scope Examined**:
  - `tests/e2e-email-intelligence-tiers.test.mjs` (74 tests across 4 Tiers)
  - `tests/fixtures/email-benchmark.json` (30 curated test cases across 6 archetypes)
  - `TEST_INFRA.md` & `PROJECT.md` & `.agents/ORIGINAL_REQUEST.md`
- **Summary**:
  The 4-tier E2E test suite architecture is exceptionally well-structured, comprehensive, and non-vacuous. It directly tests real implementation modules (`src/utils/vendorTransactions.ts`, `src/utils/needsYouFeed.ts`, `src/utils/actionInspectionSynthesis.ts`, `supabase/functions/_shared/gmail-canonical-email.mjs`, `family-email-evidence.mjs`) with zero mocking of business logic and zero integrity violations.
  However, direct execution of `node --test tests/e2e-email-intelligence-tiers.test.mjs` fails with **2 assertion errors** (72 passing, 2 failing), and `npm test` fails with **8 assertion errors** (1,794 passing, 8 failing).
  Because the primary test suite fails execution and does not exit with code 0, this work product cannot be approved until the assertion discrepancies are corrected.

---

## 2. 5-Component Handoff Report

### 1. Observation

1. **Direct Test Execution Command**:
   ```bash
   node --test tests/e2e-email-intelligence-tiers.test.mjs
   ```
   **Output**: Exited with code 1.
   - Suites: 16
   - Tests: 74 total (72 passed, 2 failed)
   - Duration: 918.04ms

2. **Failing Test 1 (T1.2.5)**:
   - File: `tests/e2e-email-intelligence-tiers.test.mjs:262-266`
   - Code:
     ```javascript
     it('T1.2.5: Nike order ID lowercase with c0 or c- prefix converts to uppercase', () => {
       assert.equal(canonicalizeOrderId('Nike', 'c0192837465'), 'C0192837465')
       assert.equal(canonicalizeOrderId('Nike.com', 'C-987654321'), 'C-987654321')
     })
     ```
   - Error:
     ```
     AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
     + actual: 'C0987654321'
     - expected: 'C-987654321'
     ```
   - Contract in `TEST_INFRA.md` line 84: `TC1.2.5: Nike order ID lowercase with c0 prefix (c0192837465 -> C0192837465)`.
   - Contract in `PROJECT.md` line 35: `Nike (C0-prefix)`.
   - Implementation in `src/utils/vendorTransactions.ts:73`: `return clean.replace(/^C-/i, 'C0').toUpperCase()` normalizes `C-` to `C0`.

3. **Failing Test 2 (T1.2.7)**:
   - File: `tests/e2e-email-intelligence-tiers.test.mjs:272-278`
   - Code:
     ```javascript
     it('T1.2.7: HelloFresh meal kit order reference canonicalization', () => {
       assert.equal(canonicalizeOrderId('HelloFresh', 'hf-98765432'), 'hf-98765432')
       assert.equal(canonicalizeOrderId('HelloFresh', 'HF-12345678'), 'hf-12345678')
       const extracted = orderId({ description: 'HelloFresh order HF-98765432 is confirmed' })
       assert.equal(extracted, 'HF-98765432')
     })
     ```
   - Error:
     ```
     AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
     + actual: 'HF-98765432'
     - expected: 'hf-98765432'
     ```
   - Contract in `TEST_INFRA.md` line 86: `TC1.2.7: HelloFresh meal kit order reference (hf-98765432 -> HF-98765432)`.
   - Implementation in `src/utils/vendorTransactions.ts:76-78`: Meal kit IDs matching `/^(?:HF|GC|BA|FACT)-\d{6,10}$/i` return `clean.toUpperCase()` (`HF-98765432`).

4. **Full Test Suite Execution Command**:
   ```bash
   npm test
   ```
   **Output**: Exited with code 1.
   - Tests: 1,802 total (1,794 passed, 8 failed)
   - Failures: 2 in `tests/e2e-email-intelligence-tiers.test.mjs`, 6 in `tests/canonical-order-resolver.test.mjs`.

5. **Benchmark Fixture Count**:
   - File: `tests/fixtures/email-benchmark.json`
   - Header: `"total_benchmark_cases": 30`
   - Actual cases: 30 items (`BM-LOG-01..05`, `BM-ACT-01..05`, `BM-TEM-01..05`, `BM-LIF-01..05`, `BM-EST-01..05`, `BM-NOI-01..05`).
   - Requirement in `ORIGINAL_REQUEST.md` §R2 and `PROJECT.md` §2 calls for "validated 200+ email ground-truth holdout benchmark dataset".

---

### 2. Logic Chain

1. `TEST_INFRA.md` defines the test runner and acceptance criteria:
   - Runner: `node --test tests/e2e-email-intelligence-tiers.test.mjs` must pass with exit code 0.
   - 100% of all test cases across Tiers 1–4 must pass.
2. In `tests/e2e-email-intelligence-tiers.test.mjs`, the test author intended to test the canonicalization contracts from `TEST_INFRA.md`.
3. However, on line 264, the test author asserted `C-987654321` when the canonicalizer contract normalizes `C-` prefixes to `C0` (`C0987654321`).
4. On line 273 and 274, the test author asserted lowercase `hf-98765432` and `hf-12345678` when `TEST_INFRA.md` and `vendorTransactions.ts` specifically standardize meal kit prefixes to uppercase (`HF-98765432`, `HF-12345678`).
5. Running `node --test tests/e2e-email-intelligence-tiers.test.mjs` fails at these two assertions, returning exit code 1.
6. Therefore, the E2E test suite cannot be approved until these two test assertions are corrected.

---

### 3. Caveats

- The 6 failing tests in `tests/canonical-order-resolver.test.mjs` belong to Milestone M3's in-flight backend resolver (`supabase/functions/_shared/canonical-order-resolver.mjs`). While they cause `npm test` to exit with code 1, our primary review scope is `tests/e2e-email-intelligence-tiers.test.mjs` and `tests/fixtures/email-benchmark.json`.
- The 30 benchmark cases in `tests/fixtures/email-benchmark.json` provide complete coverage across all 6 archetypes and all major vendors/couriers for E2E tests, but full expansion to 200+ cases is tracked under Milestone M2.

---

### 4. Conclusion

- **Verdict**: `REQUEST_CHANGES`
- **Required Fixes**:
  1. In `tests/e2e-email-intelligence-tiers.test.mjs:264`, update:
     ```javascript
     assert.equal(canonicalizeOrderId('Nike.com', 'C-987654321'), 'C0987654321')
     ```
  2. In `tests/e2e-email-intelligence-tiers.test.mjs:273-274`, update:
     ```javascript
     assert.equal(canonicalizeOrderId('HelloFresh', 'hf-98765432'), 'HF-98765432')
     assert.equal(canonicalizeOrderId('HelloFresh', 'HF-12345678'), 'HF-12345678')
     ```
  3. Once updated, re-run `node --test tests/e2e-email-intelligence-tiers.test.mjs` to verify 74/74 (100%) tests pass.

---

### 5. Verification Method

To independently verify after applying the fix:
1. Run:
   ```bash
   node --test tests/e2e-email-intelligence-tiers.test.mjs
   ```
   **Expected Output**:
   - Exit code: 0
   - Tests: 74 passing, 0 failing
   - Execution time: $<2$ seconds
2. Run:
   ```bash
   node --test tests/vendor-transaction-producer.test.mjs tests/gmail-canonical-email.test.mjs tests/gmail-attachment-multimodal-actions.test.mjs tests/action-queue-sidecar-inspection.test.mjs tests/assistant-email-knowledge-context.test.mjs
   ```
   **Expected Output**:
   - Exit code: 0
   - Tests: 38 passing, 0 failing

---

## 3. Detailed Findings

### Critical Finding 1: Broken Test Assertions in `tests/e2e-email-intelligence-tiers.test.mjs`
- **Severity**: Critical (Breaks test suite execution)
- **Location**: `tests/e2e-email-intelligence-tiers.test.mjs:264, 273, 274`
- **Description**: Two tests have expected values that contradict the project specifications and `TEST_INFRA.md`:
  - `T1.2.5`: Expected `'C-987654321'`, actual `'C0987654321'`.
  - `T1.2.7`: Expected `'hf-98765432'`, actual `'HF-98765432'`.
- **Fix Direction**: Align test assertions with `TEST_INFRA.md` lines 84 & 86.

### Major Finding 2: Full Workspace Regression (`npm test` failing)
- **Severity**: Major
- **Location**: `tests/canonical-order-resolver.test.mjs`
- **Description**: `npm test` fails 8 tests across the workspace (2 in E2E suite, 6 in M3 canonical order resolver).
- **Fix Direction**: Fix E2E suite assertions; ensure M3 agent finalizes `supabase/functions/_shared/canonical-order-resolver.mjs`.

### Minor Finding 3: Benchmark Holdout Dataset Size (30 vs 200+)
- **Severity**: Minor (Tracked under Milestone M2)
- **Location**: `tests/fixtures/email-benchmark.json`
- **Description**: Currently contains 30 curated test cases across 6 archetypes. While sufficient for 4-tier E2E testing, holdout benchmark expansion to 200+ cases will complete Milestone M2.

---

## 4. Quality & Adversarial Review Analysis

### 4.1 Tier Coverage Breakdown (74 Tests Total)
| Tier | Sub-Suites | Tests | Status | Notes |
|---|---|---|---|---|
| **Tier 1: Feature Coverage** | 7 | 38 | 36 Pass, 2 Fail | Comprehensive coverage across 6 archetypes, 7 vendors, 4 couriers, stage progression, decomposition, active learning, 0% leakage |
| **Tier 2: Boundary & Corner Cases** | 5 | 25 | 25 Pass, 0 Fail | Empty bodies, missing RFC ID, malformed HTML with script injection, date boundaries, timezone offsets, past out-for-delivery, deduplication |
| **Tier 3: Pairwise Interactions** | 6 | 6 | 6 Pass, 0 Fail | Multi-stage lifecycle + disclaimer isolation, compound newsletter decomposition, rule override + few-shot retrieval, calendar conflict alert, PII redaction, kiosk state |
| **Tier 4: Real-World Scenarios** | 5 | 5 | 5 Pass, 0 Fail | Bak MSOA School, Walmart+ InHome grocery, Delta flight schedule change, HOA notice, Apple high-value signature requirement |

### 4.2 Adversarial & Integrity Audit
- **Hardcoded Test Results**: 0 detected. All tests invoke genuine utility functions and verify real computed structures.
- **Dummy/Facade Implementations**: 0 detected. Real regex engines, date parsing, MIME parsers, and Zustand stores are exercised.
- **Test Bypasses**: 0 detected. All assertions are strict (`assert.equal`, `assert.match`, `assert.doesNotMatch`, `assert.ok`).
- **Performance Budget**: 918ms total execution time ($<10$s requirement achieved).
