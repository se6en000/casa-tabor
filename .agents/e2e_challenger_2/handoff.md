# Adversarial Challenge & Verification Report: 4-Tier Email Intelligence Test Suite

**Document**: 5-Component Hard Handoff Report  
**Author**: Challenger 2 (`e2e_challenger_2`)  
**Role**: Empirical Challenger (critic, specialist)  
**Project Root**: `/Users/taboj/casa-tabor`  
**Working Directory**: `/Users/taboj/casa-tabor/.agents/e2e_challenger_2`  
**Timestamp**: 2026-08-23T11:55:30Z  
**Verdict**: **`REQUEST_CHANGES`**

---

## 1. Observation

### Observation 1.1: Direct Test Execution Failure in `tests/e2e-email-intelligence-tiers.test.mjs`
Execution of the primary E2E test suite via `node --test tests/e2e-email-intelligence-tiers.test.mjs` revealed **2 failing tests** out of 74 tests (72 passed, 2 failed):

```
✖ failing tests:

test at tests/e2e-email-intelligence-tiers.test.mjs:262:5
✖ T1.2.5: Nike order ID lowercase with c0 or c- prefix converts to uppercase (0.499292ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  + 'C0987654321'
  - 'C-987654321'

test at tests/e2e-email-intelligence-tiers.test.mjs:272:5
✖ T1.2.7: HelloFresh meal kit order reference canonicalization (0.082375ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  + 'HF-98765432'
  - 'hf-98765432'
```

- **File**: `tests/e2e-email-intelligence-tiers.test.mjs`, Line 264:
  `assert.equal(canonicalizeOrderId('Nike.com', 'C-987654321'), 'C-987654321')`
  `canonicalizeOrderId` converts `C-` to `C0` (`clean.replace(/^C-/i, 'C0').toUpperCase()`), yielding `'C0987654321'`.
- **File**: `tests/e2e-email-intelligence-tiers.test.mjs`, Line 273:
  `assert.equal(canonicalizeOrderId('HelloFresh', 'hf-98765432'), 'hf-98765432')`
  `canonicalizeOrderId` returns `clean.toUpperCase()`, yielding `'HF-98765432'`.

### Observation 1.2: Adversarial Stress Test Suite Execution
Created and executed `tests/stress-challenger-2.test.mjs` containing 14 adversarial stress tests across all challenge tracks:
```
▶ Challenger 2: Adversarial Stress Test Suite
  ✔ Challenge 1: 0% Action Queue False Positive Leakage Invariant (26.48ms)
  ✔ Challenge 2: Multi-Recipient & Cross-Inbox Deduplication Stress Harness (28.17ms)
  ✔ Challenge 3: Tier 4 Real-World Application Scenarios Stress Harness (12.13ms)
✔ Challenger 2: Adversarial Stress Test Suite (67.02ms)
ℹ tests 14
ℹ suites 4
ℹ pass 14
ℹ fail 0
```

### Observation 1.3: Courier Alias Precedence Collision in `src/utils/vendorTransactions.ts`
In `src/utils/vendorTransactions.ts` (lines 25–30), courier aliases (`UPS`, `FedEx`, `USPS`, `DHL`) precede retail merchant aliases (`Nike`, `Apple`, `Sephora`, `Nordstrom`). When an Apple or Nike shipment notification contains text like `"MacBook Pro shipped from Apple Store via UPS 1Z..."`, `legacyVendor()` scans `VENDOR_ALIASES` in array order and matches `'ups'` before `'apple'`, labeling the vendor as `'UPS'` rather than `'Apple'`, unless explicitly keyed.

### Observation 1.4: Outlook Header Delimiter in `supabase/functions/_shared/gmail-message-content.mjs`
`stripQuotedReplyHistory` splits text using `\n(?:On .+? wrote:|From:.+\nSent:.+\nTo:.+\nSubject:)`. Outlook forwarded/reply emails containing `-----Original Message-----` before `From:` leave the trailing `-----Original Message-----` divider in the parsed body text.

---

## 2. Logic Chain

1. **Test Suite Claim vs Reality**:
   - `e2e_test_writer_1` reported 74/74 passing tests.
   - Direct empirical execution (`node --test tests/e2e-email-intelligence-tiers.test.mjs`) proves that 2 assertions in `Feature 1.2` fail due to incorrect expected values in the test file (`'C-987654321'` instead of `'C0987654321'`, and `'hf-98765432'` instead of `'HF-98765432'`).
   - The test suite cannot be approved in a failing state.

2. **0% Action Queue False Leakage Invariant (Challenge 1)**:
   - Evaluated 50 deceptive logistics permutations (claims within 3 days, 30-day return windows, "action required: select dropoff location", warranty registration, satisfaction guarantees) across 10 vendor archetypes.
   - Evaluated a bulk mixed batch of 200 passive logistics notices + 10 true executive action items.
   - **Result**: `splitActionableAndTransitItems()` achieved **100.0% adherence to the invariant (0% false leakage)**. Every single passive parcel stayed strictly inside `deliveryTransitItems`.

3. **Multi-Recipient & Cross-Inbox Deduplication (Challenge 2)**:
   - Tested cross-inbox broadcast delivery (Jacob + Courtney inboxes receiving the same school bulletin).
   - Validated that normalized RFC Message-IDs produce identical `rfc:...` keys regardless of sender display name or arrival jitter.
   - Validated that SHA-256 fallback fingerprints survive carriage return, whitespace, and case perturbations.
   - Validated 10-minute time-bucketing for missing Message-IDs.

4. **Tier 4 Real-World Application Scenarios (Challenge 3)**:
   - **Bak MSOA Camp**: Compound email and multimodal attachments correctly split into parent forms ($175 fee waiver) and calendar events (Curriculum Night Aug 27 at 5:30 PM).
   - **Walmart+ InHome Perishable Grocery**: Out-of-order stage arrivals (Delivered received before Confirmed or Out for delivery) correctly maintain terminal delivered state without regressing, while preserving perishable flags and cost ($142.50).
   - **Delta Schedule Change**: Time change conflict with pediatric orthodontist visit successfully elevates to Priority 2 in `needsYouFeed`.
   - **HOA Notice**: PII redaction filters student/member IDs, SSNs, and PINs, while indexing estate knowledge claims and routing walkway clearance tasks.
   - **Apple Signature Parcel**: Direct signature requirement notice remains in Logistics Radar without polluting the Action Queue.

---

## 3. Caveats

1. **Test File Adjustments Required**: The failures in `tests/e2e-email-intelligence-tiers.test.mjs` are purely due to typographical assertion mismatches in the test file (the underlying `canonicalizeOrderId` implementation in `src/utils/vendorTransactions.ts` correctly enforces canonical uppercase and C0 prefix conventions as mandated by `PROJECT.md`).
2. **Review-Only Constraint**: In accordance with the Review-Only constraint, Challenger 2 did not modify `tests/e2e-email-intelligence-tiers.test.mjs` or `src/utils/vendorTransactions.ts`. These fixes must be applied by the test author or orchestrator.

---

## 4. Conclusion & Actionable Verdict

### Explicit Verdict: **`REQUEST_CHANGES`**

### Required Action Items:

1. **Fix `tests/e2e-email-intelligence-tiers.test.mjs` Line 264**:
   - *Current*: `assert.equal(canonicalizeOrderId('Nike.com', 'C-987654321'), 'C-987654321')`
   - *Expected*: `assert.equal(canonicalizeOrderId('Nike.com', 'C-987654321'), 'C0987654321')`
2. **Fix `tests/e2e-email-intelligence-tiers.test.mjs` Line 273**:
   - *Current*: `assert.equal(canonicalizeOrderId('HelloFresh', 'hf-98765432'), 'hf-98765432')`
   - *Expected*: `assert.equal(canonicalizeOrderId('HelloFresh', 'hf-98765432'), 'HF-98765432')`
3. **Enhance `legacyVendor()` in `src/utils/vendorTransactions.ts`**:
   - Move retail merchants (`Apple`, `Nike`, `Target`, `Sephora`, etc.) before generic courier services (`UPS`, `FedEx`, `USPS`, `DHL`) in `VENDOR_ALIASES` or prioritize `item.attention_vendor` over text matching so merchant orders shipped via courier are not misclassified as the courier.
4. **Enhance `stripQuotedReplyHistory` in `supabase/functions/_shared/gmail-message-content.mjs`**:
   - Add `\n-----Original Message-----` to the split pattern to cleanly strip Outlook reply dividers.

---

## 5. Verification Method

To independently verify all findings and test suites:

```bash
# 1. Run the failing baseline E2E test suite (verifies 2 failures in T1.2.5 and T1.2.7)
node --test tests/e2e-email-intelligence-tiers.test.mjs

# 2. Run Challenger 2's comprehensive adversarial stress test suite (14/14 pass)
node --test tests/stress-challenger-2.test.mjs
```
