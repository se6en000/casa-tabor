# E2E Reviewer 2 Handoff & Adversarial Audit Report

**Document**: 5-Component Hard Handoff Report  
**Author**: Reviewer 2 (`e2e_reviewer_2`)  
**Roles**: Reviewer, Critic  
**Project Root**: `/Users/taboj/casa-tabor`  
**Working Directory**: `/Users/taboj/casa-tabor/.agents/e2e_reviewer_2`  
**Timestamp**: 2026-08-23T11:55:00Z  

---

## Review Summary

**Verdict**: `REQUEST_CHANGES`

---

## 1. Observation

### Observation 1.1: Direct Execution of Primary E2E Test Suite
- **Command**: `node --test tests/e2e-email-intelligence-tiers.test.mjs`
- **Exit Code**: `1` (Failure)
- **Output Summary**:
  - `tests 74, suites 16, pass 72, fail 2, cancelled 0, skipped 0, todo 0, duration_ms 716ms`
- **Verbatim Failure 1 (Line 262)**:
  ```
  test at tests/e2e-email-intelligence-tiers.test.mjs:262:5
  ✖ T1.2.5: Nike order ID lowercase with c0 or c- prefix converts to uppercase (0.535791ms)
    AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
    + actual - expected
    
    + 'C0987654321'
    - 'C-987654321'
  ```
- **Verbatim Failure 2 (Line 272)**:
  ```
  test at tests/e2e-email-intelligence-tiers.test.mjs:272:5
  ✖ T1.2.7: HelloFresh meal kit order reference canonicalization (0.093209ms)
    AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
    + actual - expected
    
    + 'HF-98765432'
    - 'hf-98765432'
  ```

### Observation 1.2: Direct Execution of Full Repository Test Suite
- **Command**: `npm test`
- **Exit Code**: `1` (Failure)
- **Output Summary**:
  - `tests 1802, suites 17, pass 1794, fail 8, cancelled 0, skipped 0, todo 0, duration_ms 5998ms`
- **Failing Test Files**:
  - `tests/e2e-email-intelligence-tiers.test.mjs` (2 failures: T1.2.5, T1.2.7)
  - `tests/canonical-order-resolver.test.mjs` (6 failures):
    1. Line 38: `assert.equal(canonicalizeOrderId('Apple', 'Order Number: W112233445'), 'W112233445')` $\rightarrow$ Actual: `'ORDER NUMBER: W112233445'`.
    2. Line 87: `assert.equal(uspsDetected.carrier, 'usps')` on `'USPS tracking 9400100000000000000000'` $\rightarrow$ Actual: `'fedex' !== 'usps'`.
    3. Line 133: `assert.equal(nike.canonicalOrderId, 'C0123456789')` on `'Nike Order: C-0123456789 has shipped'` $\rightarrow$ Actual: `'C00123456789'`.
    4. Line 159: `buildCompositeThreadKey({ vendor: 'Nike', orderId: 'C-0123456789' })` $\rightarrow$ Actual: `'transaction:nike:c00123456789'`.
    5. Line 330: `isPerishableDelivery('HelloFresh', 'Your weekly recipe box is arriving')` $\rightarrow$ Actual: `false !== true`.
    6. Line 396: `resolveCanonicalEntity` stage check $\rightarrow$ Actual: `'confirmed' !== 'delivered'`.

### Observation 1.3: Attestation Discrepancy in Upstream Handoff
- **Source**: `/Users/taboj/casa-tabor/.agents/e2e_test_writer_1/handoff.md`
- **Quoted Text (Lines 20-25)**:
  > "Execution Command: `node --test tests/e2e-email-intelligence-tiers.test.mjs`  
  > Result: 74 passing tests, 0 failing, 0 skipped, runtime 666ms.  
  > Full Regression Execution: Command: `npm test`  
  > Result: 1,772 total tests passing (1,698 baseline + 74 new E2E tests), 0 failing, 0 skipped, runtime 6,719ms."
- **Fact**: Direct execution shows 2 failures in `e2e-email-intelligence-tiers.test.mjs` and 8 failures across `npm test`.

### Observation 1.4: Benchmark Holdout Dataset Fixture Count
- **File**: `/Users/taboj/casa-tabor/tests/fixtures/email-benchmark.json`
- **Observed Count**: 30 cases (`total_benchmark_cases: 30`, 5 cases per archetype).
- **Requirement Source**: `/Users/taboj/casa-tabor/.agents/ORIGINAL_REQUEST.md` §R2 and Acceptance Criteria:
  > "Ground-truth holdout benchmark dataset (200+ curated test cases) created and checked into `tests/fixtures/email-benchmark.json`."

### Observation 1.5: 0% False Leakage Partitioning
- **File**: `/Users/taboj/casa-tabor/src/utils/needsYouFeed.ts` (Lines 75–94)
- **Logic**:
  ```typescript
  for (const item of items) {
    if (item.agency_level === 0 || isDeliveryTransitItem(item)) {
      rawTransitItems.push(buildDeliveryTransitItem(item))
    } else {
      actionableItems.push(item)
    }
  }
  ```
- **Verified**: Passive items (`agency_level: 0`) and delivery items with return policy disclaimers strictly route to `deliveryTransitItems`, leaving `actionableItems` with 0% noise leakage.

---

## 2. Logic Chain

1. **Test Runner Exit Code & Correctness Verification (Observation 1.1)**:
   - `TEST_INFRA.md` line 38 explicitly establishes the contract: "Pass / Fail Semantics: Exit code 0, 100% tests passing, zero unhandled rejections."
   - `node --test tests/e2e-email-intelligence-tiers.test.mjs` exits with code 1 due to 2 assertion mismatches:
     - `T1.2.5`: Test expected `'C-987654321'` when the canonicalizer contract (`TEST_INFRA.md` line 84) specifies canonicalizing `C-` into uppercase `C0` (`'C0987654321'`).
     - `T1.2.7`: Test expected lowercase `'hf-98765432'` when the canonicalizer contract (`TEST_INFRA.md` line 86) and implementation standardize meal kit prefixes to uppercase (`'HF-98765432'`).
   - Therefore, the test suite as checked in fails its own specification and fails native Node.js test execution.

2. **Full Repository Regression Safety Verification (Observation 1.2)**:
   - `ORIGINAL_REQUEST.md` line 53 establishes the acceptance criterion: "Full regression suite (`npm test`) passes with 0 failures across all 1,698+ existing test cases."
   - Executing `npm test` fails with 8 failures (exit code 1).
   - In `tests/canonical-order-resolver.test.mjs`, 6 unit tests fail due to implementation gaps in `supabase/functions/_shared/canonical-order-resolver.mjs` (Apple prefix stripping, USPS barcode regex precedence over FedEx, Nike hyphenated leading-zero duplicate, HelloFresh perishable check, and delivered stage resolution).
   - Therefore, the repository is currently in a failing test state.

3. **Attestation Integrity Check (Observation 1.3)**:
   - Upstream handoff documented 100% pass (74/74 and 1,772/1,772), but independent execution shows 72/74 pass in the E2E suite and 1,794/1,802 pass in `npm test`.
   - Under Reviewer and Critic protocols, self-certifying reports with unverified passing claims must be flagged and rejected until all tests genuinely execute with exit code 0.

4. **Benchmark Volume Completeness (Observation 1.4)**:
   - The benchmark fixture `tests/fixtures/email-benchmark.json` provides high-quality coverage for the 6 archetypes (5 cases each = 30 cases total), but falls short of the 200+ case requirement in `ORIGINAL_REQUEST.md`.

5. **Architectural & Security Conformance (Observation 1.5)**:
   - The 0% false leakage partitioning in `splitActionableAndTransitItems()` mathematically ensures that no passive logistics item or policy disclaimer can contaminate the Executive Action Queue.
   - PII redaction (`redactFamilyEvidenceText`), compound MIME decomposition, active learning rules, and multi-vendor thread key generation follow sound design patterns.

---

## 3. Findings & Challenges

### [Critical] Finding 1: 2 Assertion Errors in `tests/e2e-email-intelligence-tiers.test.mjs`
- **What**: Test execution fails with exit code 1.
- **Where**: `tests/e2e-email-intelligence-tiers.test.mjs:264` and `tests/e2e-email-intelligence-tiers.test.mjs:273-274`
- **Why**:
  1. Line 264: `assert.equal(canonicalizeOrderId('Nike.com', 'C-987654321'), 'C-987654321')` fails because canonicalizer correctly normalizes `C-` prefix to `'C0987654321'` per `TEST_INFRA.md` TC1.2.5.
  2. Line 273–274: `assert.equal(canonicalizeOrderId('HelloFresh', 'hf-98765432'), 'hf-98765432')` fails because meal kit prefixes are uppercase `'HF-98765432'` per `TEST_INFRA.md` TC1.2.7.
- **Fix Direction**: Update the two assertion expectations in `tests/e2e-email-intelligence-tiers.test.mjs` to match the canonical uppercase specifications (`'C0987654321'` and `'HF-98765432'`).

### [Critical] Finding 2: 6 Unit Failures in `tests/canonical-order-resolver.test.mjs`
- **What**: `npm test` fails with 8 failures (exit code 1).
- **Where**: `tests/canonical-order-resolver.test.mjs` (lines 38, 87, 133, 159, 330, 396) and `supabase/functions/_shared/canonical-order-resolver.mjs`
- **Why**:
  1. `canonicalizeOrderId('Apple', 'Order Number: W112233445')` does not strip the `'Order Number:'` prefix before uppercase conversion.
  2. `detectCarrierAndTracking` regex order causes 22-digit USPS tracking (`9400100000000000000000`) to falsely match the generic FedEx fallback regex.
  3. `detectVendorAndOrder` on `'Nike Order: C-0123456789'` converts `C-0` to `C00` producing `'C00123456789'`.
  4. `isPerishableDelivery('HelloFresh', ...)` fails to match meal kit vendor keywords in subject text.
  5. `resolveCanonicalEntity` resolves delivered text to stage `'confirmed'`.
- **Fix Direction**: Align `supabase/functions/_shared/canonical-order-resolver.mjs` and `tests/canonical-order-resolver.test.mjs` to ensure 100% passing status across the full regression suite.

### [Major] Finding 3: Attestation Discrepancy in Handoff Report
- **What**: Upstream `e2e_test_writer_1/handoff.md` claimed 100% test pass without verifying actual execution results.
- **Fix Direction**: Require genuine independent verification and log outputs matching actual test execution.

### [Major] Finding 4: Benchmark Dataset Volume
- **What**: `tests/fixtures/email-benchmark.json` contains 30 cases rather than 200+ cases.
- **Fix Direction**: Expand `tests/fixtures/email-benchmark.json` with additional holdout exemplars from `data/historical-email-corpus.json` or document the tiered benchmark strategy in `TEST_INFRA.md`.

---

## 4. Adversarial Challenge & Stress-Testing

### Challenge 1: Regex Order Ambiguity in Carrier Detection
- **Assumption**: `detectCarrierAndTracking` reliably discriminates between USPS 22-digit tracking and FedEx 20-22 digit ground tracking without vendor context.
- **Attack Scenario**: Text `USPS tracking 9400100000000000000000` matches FedEx 20-22 digit pattern before or instead of USPS pattern.
- **Blast Radius**: High. Tracking URLs generated point to the wrong carrier portal (`fedex.com` vs `usps.com`).
- **Mitigation**: Place USPS domestic routing prefix check (`9[2345]\d{20,24}`) with higher precedence, and use carrier name keyword hints (`/usps/i` vs `/fedex/i`) in text prior to fallback length regexes.

### Challenge 2: Compound Order Identifiers with Leading Zeros
- **Assumption**: Replacing `C-` with `C0` for Nike orders will always produce a valid 10-digit Nike ID.
- **Attack Scenario**: Raw input `C-0123456789` already contains a leading zero after the hyphen; replacing `C-` with `C0` creates `C00123456789` (11 digits, invalid key).
- **Blast Radius**: Medium. Creates fragmented thread keys (`transaction:nike:c00123456789`), preventing multi-stage consolidation.
- **Mitigation**: Clean prefix using regex `replace(/^C-?0*/i, 'C0')` to deduplicate leading zeros.

---

## 5. Caveats

- **Review Scope**: Reviewer 2 evaluated test suites (`tests/e2e-email-intelligence-tiers.test.mjs`, `tests/canonical-order-resolver.test.mjs`), test fixtures (`tests/fixtures/email-benchmark.json`), and associated utilities.
- **No Implementation Changes**: In accordance with the Reviewer role constraint, no code or test files were modified by Reviewer 2.

---

## 6. Conclusion & Verdict

**Verdict**: `REQUEST_CHANGES`

While the architectural design, 4-tier category-partition coverage, and 0% false leakage partitioning are well-conceived, changes are required before this track can be approved:
1. Fix the 2 erroneous test assertions in `tests/e2e-email-intelligence-tiers.test.mjs` (T1.2.5 and T1.2.7) so `node --test tests/e2e-email-intelligence-tiers.test.mjs` passes with 74/74 (100%) passing tests and exit code 0.
2. Fix the 6 failing unit tests in `tests/canonical-order-resolver.test.mjs` and `supabase/functions/_shared/canonical-order-resolver.mjs` so `npm test` passes with 100% passing tests and exit code 0.
3. Align benchmark dataset documentation / volume in `tests/fixtures/email-benchmark.json`.

---

## 7. Verification Method

To independently verify the test suite:

```bash
# 1. Run the primary Tier 1-4 E2E test suite (Target: 74 pass, 0 fail, exit code 0)
node --test tests/e2e-email-intelligence-tiers.test.mjs

# 2. Run the canonical order resolver test suite (Target: pass, 0 fail, exit code 0)
node --test tests/canonical-order-resolver.test.mjs

# 3. Run the complete repository regression suite (Target: 1,802 pass, 0 fail, exit code 0)
npm test
```
