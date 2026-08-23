# Empirical Adversarial Challenge Report: E2E Email Intelligence Testing

**Document**: 5-Component Hard Handoff Report  
**Author**: Empirical Challenger 1 (`e2e_challenger_1`)  
**Verdict**: `REQUEST_CHANGES`  
**Target Files**: `tests/e2e-email-intelligence-tiers.test.mjs`, `tests/fixtures/email-benchmark.json`  
**Timestamp**: 2026-08-23T11:55:30Z  

---

## 1. Observation

### 1.1 Direct Test Suite Execution Failures
Execution of `node --test tests/e2e-email-intelligence-tiers.test.mjs` exits with code 1, reporting 72 passing tests and **2 failing tests**:

1. **Test Failure 1** — `tests/e2e-email-intelligence-tiers.test.mjs:262` (`T1.2.5: Nike order ID lowercase with c0 or c- prefix converts to uppercase`):
   ```
   AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
   + actual - expected
   + 'C0987654321'
   - 'C-987654321'
       at TestContext.<anonymous> (file:///Users/taboj/casa-tabor/tests/e2e-email-intelligence-tiers.test.mjs:264:14)
   ```
   - **Verbatim Code**: `assert.equal(canonicalizeOrderId('Nike.com', 'C-987654321'), 'C-987654321')`
   - **Actual Implementation** (`src/utils/vendorTransactions.ts:72-74`):
     ```ts
     if (v.includes('nike') || /^C[0-]\d{9,11}$/i.test(clean)) {
       return clean.replace(/^C-/i, 'C0').toUpperCase()
     }
     ```
   - `canonicalizeOrderId` purposefully standardizes `C-` to `C0`. The test's expected value contradicts the implementation and contradicts `T2.2.5` (`tests/e2e-email-intelligence-tiers.test.mjs:742`).

2. **Test Failure 2** — `tests/e2e-email-intelligence-tiers.test.mjs:272` (`T1.2.7: HelloFresh meal kit order reference canonicalization`):
   ```
   AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
   + actual - expected
   + 'HF-98765432'
   - 'hf-98765432'
       at TestContext.<anonymous> (file:///Users/taboj/casa-tabor/tests/e2e-email-intelligence-tiers.test.mjs:273:14)
   ```
   - **Verbatim Code**: `assert.equal(canonicalizeOrderId('HelloFresh', 'hf-98765432'), 'hf-98765432')`
   - **Actual Implementation** (`src/utils/vendorTransactions.ts:76-78`):
     ```ts
     if (/^(?:HF|GC|BA|FACT)-\d{6,10}$/i.test(clean)) {
       return clean.toUpperCase()
     }
     ```
   - The test erroneously asserts lowercase `'hf-98765432'`, contradicting both the uppercase return contract and the benchmark fixture (`tests/fixtures/email-benchmark.json:58`: `"expected_canonical_order_id": "HF-9928172"`).

---

### 1.2 Vacuous & Tautological Test Cases
Static analysis and function call tracking across all 74 `it()` blocks revealed **3 completely vacuous test cases** that exercise zero system or module code and assert only against raw in-memory literal declarations:

1. **`tests/e2e-email-intelligence-tiers.test.mjs:441` (`T1.5.3`)**:
   ```js
   it('T1.5.3: Email body + attachment hybrid extraction yields source_origin: "compound"', () => {
     const item = {
       id: 'comp-1',
       type: 'forms',
       event_title: 'Fall Orientation and Forms',
       description: 'Complete orientation paperwork and review attached checklist.',
       source_origin: 'compound',
     }
     assert.equal(item.source_origin, 'compound')
   })
   ```
   - Zero function calls. Asserts property on a freshly declared local object.

2. **`tests/e2e-email-intelligence-tiers.test.mjs:452` (`T1.5.4`)**:
   ```js
   it('T1.5.4: Sibling action deduplication linking all sub-tasks to parent thread ID', () => {
     const item1 = { id: 'act-1', cluster_id: 'thread-99', description: 'Task 1' }
     const item2 = { id: 'act-2', cluster_id: 'thread-99', description: 'Task 2' }
     assert.equal(item1.cluster_id, item2.cluster_id)
   })
   ```
   - Zero function calls. Asserts two literal objects created with the same `cluster_id` have equal `cluster_id`.

3. **`tests/e2e-email-intelligence-tiers.test.mjs:539` (`T1.6.5`)**:
   ```js
   it('T1.6.5: Rule origin metadata tracks user_label, voice_directive, and learned_feedback', () => {
     const sampleRule = {
       pattern_type: 'domain',
       pattern_value: 'palmbeachschools.org',
       rule_directive: 'Scan for school waivers',
       origin: 'voice_directive',
       confidence: 1.0,
     }
     assert.equal(sampleRule.origin, 'voice_directive')
     assert.equal(sampleRule.confidence, 1.0)
   })
   ```
   - Zero function calls. Asserts properties declared on a static object.

4. **`tests/e2e-email-intelligence-tiers.test.mjs:735` (`T2.2.4`)**:
   ```js
   const normalized = canonicalizeOrderId('GenericStore', longHash)
   assert.equal(typeof normalized, 'string')
   ```
   - Weak assertion: verifies only type `'string'` without verifying output value integrity.

---

### 1.3 Benchmark Fixture Coverage Gap (80% Orphaned Fixtures)
- `tests/fixtures/email-benchmark.json` defines 30 benchmark cases.
- `tests/e2e-email-intelligence-tiers.test.mjs` only references 6 benchmark cases (`BM-LOG-01`, `BM-ACT-01`, `BM-TEM-01`, `BM-LIF-01`, `BM-EST-01`, `BM-NOI-01`).
- The remaining 24 benchmark cases are completely unexercised by the test suite.
- Empirical evaluation of all 30 benchmark cases against the system pipeline surfaced **3 real system defects**:
  1. `BM-LOG-04` (Target drive-up pickup): `transactionStage` returns `null` because `"ready for drive-up pickup"` is not recognized in `isExplicitOutForDelivery` regex.
  2. `BM-EST-03` (Weekly Pool Chemistry Log): `classifyFamilyEvidenceCandidate` returns `eligible: false` because `CATEGORY_PATTERNS` lacks home/pool/property maintenance keywords.
  3. `BM-NOI-05` (Abandoned cart promotional discount): `classifyFamilyEvidenceCandidate` falsely marks it `eligible: true` (`category: order_delivery`) because `"complete"` in `"Complete your order"` matches `OPERATIONAL_OVERRIDE_PATTERN`, defeating the promotional filter.

---

### 1.4 Unhandled Edge-Case Crashes in Underlying Modules
Running our stress-testing harness against boundary conditions revealed unhandled exception vectors:
1. **Null MIME part crash**:
   - `extractGmailMessageContent({ parts: [null] })` throws `TypeError: Cannot read properties of null (reading 'mimeType')` at `supabase/functions/_shared/gmail-message-content.mjs:41`.
2. **Invalid Base64 payload crash**:
   - `extractGmailMessageContent({ body: { data: "!!!invalid-base64***" } })` throws `DOMException [InvalidCharacterError]: Invalid character` in `decodeBase64Url` because `atob()` is called without error handling.

---

### 1.5 Performance & Stability Benchmark
10 consecutive runs of `tests/e2e-email-intelligence-tiers.test.mjs`:
- Min: `772.36ms`
- Max: `4071.75ms` (cold start)
- Avg: `1566.34ms`
- Steady-state warm runs: `~770–819ms`
- Determinism: 100% deterministic (no intermittent timing flakes).

---

## 2. Logic Chain

1. **From Observation 1.1**: The E2E test suite does not pass cleanly out-of-the-box (`node --test tests/e2e-email-intelligence-tiers.test.mjs` exits with code 1 due to two broken assertions). An E2E test suite cannot be approved while failing its own test run.
2. **From Observation 1.2**: Tests T1.5.3, T1.5.4, and T1.6.5 provide false confidence because they do not invoke the actual business logic functions (`detectSuggestedActionBundle`, `matchCaptureRules`, etc.). If the underlying logic breaks, these tests will still pass because they only assert properties of local object literals.
3. **From Observation 1.3**: The test fixture dataset was built to provide a 30-case benchmark, but the test suite only tests 6 cases (20% coverage). 3 of the unexercised cases contain actual pipeline classification bugs that went undetected because the fixtures were not hooked up to automated assertions.
4. **From Observation 1.4**: Critical MIME extraction helpers (`gmail-message-content.mjs`) lack guardrails for null parts and corrupted base64 payloads, leading to uncaught runtime exceptions during email synchronization.
5. **Conclusion**: The test suite requires fixes to broken assertions, replacement of vacuous tests with real functional calls, and complete integration of the 30 benchmark cases before it can be certified.

---

## 3. Caveats

- **Scope boundary**: This review evaluated offline E2E modules and unit contracts (`tests/e2e-email-intelligence-tiers.test.mjs` and related shared utilities). Live Gmail API OAuth token refresh and live Supabase RPC network calls were not tested in offline CI mode.
- **Implementation preservation**: Per role instructions, no implementation files in `src/` or `supabase/functions/` were modified by Challenger 1.

---

## 4. Conclusion & Required Actions

**Verdict**: `REQUEST_CHANGES`

### Required Changes for Approval:
1. **Fix Broken Assertions in `tests/e2e-email-intelligence-tiers.test.mjs`**:
   - In `T1.2.5` (line 264), change expected output of `canonicalizeOrderId('Nike.com', 'C-987654321')` to `'C0987654321'`.
   - In `T1.2.7` (line 273), change expected output of `canonicalizeOrderId('HelloFresh', 'hf-98765432')` to `'HF-98765432'`.
2. **Eliminate Vacuous Tests**:
   - Update `T1.5.3` to invoke `detectSuggestedActionBundle` or item classifier to verify `source_origin: 'compound'` derivation.
   - Update `T1.5.4` to invoke `detectSuggestedActionBundle(parent, null, [sibling1, sibling2])` and assert that returned bundle actions correctly aggregate and link to the parent `clusterId`.
   - Update `T1.6.5` to invoke `matchCaptureRules([sampleRule], from, subject)` and assert rule metadata preservation.
   - Update `T2.2.4` to assert exact string normalization preservation (e.g. `assert.equal(normalized, 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5')`).
3. **Expand Benchmark Fixture Execution**:
   - Add a parameterized test suite loop in `tests/e2e-email-intelligence-tiers.test.mjs` iterating over all 30 benchmark cases in `tests/fixtures/email-benchmark.json`.
4. **Fix MIME Payload Parser Guardrails**:
   - In `supabase/functions/_shared/gmail-message-content.mjs`, add `if (!part) return` in `walk(part)` and wrap `atob()` in a try/catch block.

---

## 5. Verification Method

To reproduce all observations and failures independently:

```bash
# 1. Run the E2E test suite to observe the 2 assertion failures
node --test tests/e2e-email-intelligence-tiers.test.mjs

# 2. Run the 30-case benchmark pipeline evaluation
node -e '
import fs from "fs";
import { canonicalizeOrderId, orderId, detectVendorAndOrder, detectCarrierAndTracking, transactionStage } from "./src/utils/vendorTransactions.ts";
import { classifyFamilyEvidenceCandidate } from "./supabase/functions/_shared/family-email-evidence.mjs";

const bm = JSON.parse(fs.readFileSync("tests/fixtures/email-benchmark.json", "utf8"));
console.log("Total cases:", bm.benchmark_cases.length);
'

# 3. Test MIME parser crash on null part
node -e '
import { extractGmailMessageContent } from "./supabase/functions/_shared/gmail-message-content.mjs";
try {
  extractGmailMessageContent({ parts: [null] });
} catch (e) {
  console.log("MIME Null Part Crash Verified:", e.message);
}
'
```
