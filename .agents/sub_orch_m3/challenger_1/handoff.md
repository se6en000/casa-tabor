# Handoff Report: Milestone 3 — Challenger 1 Adversarial Stress-Testing

**Verdict**: `REQUEST_CHANGES`

---

## 1. Observation

Adversarial stress-testing suite created at `/Users/taboj/casa-tabor/tests/adversarial-canonical-order-resolver.test.mjs` containing 10 comprehensive test suites spanning unusual whitespace, mixed-case order IDs, compound emails with multiple tracking numbers, malformed URLs, extreme dates, conflicting stage signals, invariant verification, and 500-iteration random fuzzing.

### Observed Test Results
Command executed:
```bash
node --test tests/adversarial-canonical-order-resolver.test.mjs
```
Output:
```
✖ ADV-1: Weird whitespace, control characters, and exotic delimiters (1.050208ms)
✔ ADV-2: Mixed-case, prefix permutations, and vendor variants (0.223875ms)
✔ ADV-3: Compound emails with both Order Number AND multiple Courier Tracking Numbers (17.346333ms)
✔ ADV-4: Malformed, query-dense, and percent-encoded URLs (0.871958ms)
✔ ADV-5: Extreme Future, Past, and Boundary Dates (0.218292ms)
✔ ADV-6: INVARIANT VERIFICATION — Future arrival dates NEVER resolve to delivered (3.940584ms)
✔ ADV-7: INVARIANT VERIFICATION — Past courier auto-resolution strictly applies to same-day out_for_delivery (0.258125ms)
✔ ADV-8: INVARIANT VERIFICATION — 0% Action Queue leakage under adversarial inputs (21.490917ms)
✔ ADV-9: Conflicting and ambiguous stage signals state machine resolution (0.114916ms)
✖ ADV-10: Fuzzing harness — 500 random and pathological permutations (6.9835ms)
ℹ tests 10
ℹ suites 0
ℹ pass 8
ℹ fail 2
```

### Specific Failure 1: Unhandled `RangeError: Invalid time value` in `src/utils/vendorTransactions.ts`
When an item with a malformed date (e.g. `'not-a-date'`, invalid ISO strings, or unparseable date headers) is passed to client utilities, `date-fns` `format()` and `differenceInCalendarDays()` throw unhandled `RangeError: Invalid time value` exceptions.
- **Location 1**: `/Users/taboj/casa-tabor/src/utils/vendorTransactions.ts:1183`
  ```typescript
  const rawEta = item.etaDisplay || item.rawEta || (etaMatch ? etaMatch[0].trim() : (deliveryDateObj ? format(deliveryDateObj, 'EEE, MMM d') : null))
  ```
  `deliveryDateObj` is instantiated via `new Date(item.deliveryDate)`. When `item.deliveryDate` is invalid, `deliveryDateObj` is an `Invalid Date` object (`isNaN(deliveryDateObj.getTime()) === true`), which causes `format()` to crash.
- **Location 2**: `/Users/taboj/casa-tabor/src/utils/vendorTransactions.ts:991, 1001`
  ```typescript
  if (stage === 'delivered') {
    if (!deliveryDate) return 'Delivered'
    if (now) {
      const diff = differenceInCalendarDays(deliveryDate, now) // Throws if deliveryDate is invalid
  ```
- **Location 3**: `/Users/taboj/casa-tabor/src/utils/vendorTransactions.ts:1074`
  ```typescript
  const rawEta = etaMatch ? etaMatch[0].trim() : (targetDate ? format(targetDate, 'EEE, MMM d') : ...) // Throws if targetDate is invalid
  ```
- **Contrast**: `supabase/functions/_shared/canonical-order-resolver.mjs:624` correctly guards with:
  ```javascript
  const isValidDate = d && !isNaN(d.getTime())
  if (!isValidDate) return rawEta || null
  ```

### Specific Failure 2: Apple and Nike Order Number Thread Key Divergence on Interior Whitespace
In both `/Users/taboj/casa-tabor/supabase/functions/_shared/canonical-order-resolver.mjs:77-87` and `/Users/taboj/casa-tabor/src/utils/vendorTransactions.ts:69-79`:
```javascript
const appleMatch = clean.match(/W\d{9,10}/i)
if (v.includes('apple') || appleMatch) {
  return appleMatch ? appleMatch[0].toUpperCase() : clean.toUpperCase()
}
```
When an order number contains interior whitespace or non-breaking spaces (e.g. `'w\u00A0123456789'` or `'W 123456789'`), `appleMatch` fails because `\d` does not match `\s`. The fallback returns `'W 123456789'`.
Consequently:
```javascript
buildCompositeThreadKey({ vendor: 'Apple', orderId: 'W123456789' })  // -> 'transaction:apple:w123456789'
buildCompositeThreadKey({ vendor: 'Apple', orderId: 'W 123456789' }) // -> 'transaction:apple:w-123456789'
```
The two emails fail to consolidate into the same composite thread key.

---

## 2. Logic Chain

1. **Date Validation in Client Resolver**:
   - `resolveCanonicalEntity` accepts user/email inputs which may contain malformed date strings.
   - While `deliveryDateIso` checks `!isNaN(deliveryDateObj.getTime())`, line 1183 calls `format(deliveryDateObj, 'EEE, MMM d')` directly if `deliveryDateObj` is truthy.
   - An `Invalid Date` in JavaScript is truthy (`typeof new Date('invalid') === 'object'`), leading directly to `RangeError: Invalid time value` in `date-fns`.
   - Adding `const isValidDate = deliveryDateObj && !isNaN(deliveryDateObj.getTime())` and using `isValidDate ? format(deliveryDateObj, 'EEE, MMM d') : null` resolves this completely.

2. **Whitespace Normalization in Vendor Canonicalization**:
   - Vendors like Walmart (`200015480824348` -> `2000154-80824348`) and Amazon (`11284729104829103` -> `112-8472910-4829103`) extract pure digits before formatting.
   - For Apple and Nike, stripping interior whitespace and punctuation (`clean.replace(/[\s.-]+/g, '')`) before matching `W\d{9,10}` and `C0\d{9,11}` ensures that `'W 123456789'`, `'w-123456789'`, and `'W123456789'` all normalize to the exact same canonical string `'W123456789'`.

3. **Core Invariant Verifications (100% Passed)**:
   - **Future Arrival Date Guardrail (ADV-6)**: 50+ adversarial inputs with explicit past-tense delivery declarations ("has been delivered", "delivered to porch") paired with future arrival dates were tested. In 100% of cases, the resolver downgraded `delivered` to `confirmed` / in-transit, completely preventing premature next-day auto-resolution.
   - **Past Courier Auto-Resolution (ADV-7)**: Tested past timestamps on `out_for_delivery`, `shipped`, `confirmed`, `payment`, and `problem`. Auto-resolution to `delivered` strictly fired for past same-day courier dispatches (`out_for_delivery`) and NEVER for multi-day freight (`shipped`), unfulfilled orders (`confirmed`), or exceptions (`problem`).
   - **0% Action Queue Leakage (ADV-8)**: Tested passive delivery updates, return windows, claim policies, and temporary holds through `splitActionableAndTransitItems` and `resolveCanonicalEntity`. All items were assigned `agencyLevel: 0` and consolidated into transit items with 0 items leaked into `actionableItems`.

---

## 3. Caveats

- The core architecture, state machine, composite thread keying schema, future date guardrail, and action queue partitioning are sound and robust.
- The issues identified are targeted edge-case robustness fixes in date validity checking and interior whitespace sanitization.

---

## 4. Conclusion

**Verdict**: `REQUEST_CHANGES`

Worker 1 should apply the following targeted fixes:

1. **In `src/utils/vendorTransactions.ts`**:
   - In `formatDeliveryEta`: Ensure `deliveryDate` is checked with `!deliveryDate || isNaN(deliveryDate.getTime())` before calling `differenceInCalendarDays`, `isBefore`, or `format`.
   - In `buildDeliveryTransitItem`: Guard `targetDate` with `const isValidDate = targetDate && !isNaN(targetDate.getTime())` before `format(targetDate, 'EEE, MMM d')`.
   - In `resolveCanonicalEntity`: Guard `deliveryDateObj` with `const isValidDate = deliveryDateObj && !isNaN(deliveryDateObj.getTime())` before `format(deliveryDateObj, 'EEE, MMM d')`.

2. **In `supabase/functions/_shared/canonical-order-resolver.mjs` and `src/utils/vendorTransactions.ts`**:
   - In `canonicalizeOrderId`: For Apple and Nike, sanitize whitespace/punctuation before regex matching:
     ```javascript
     const appleSanitized = clean.replace(/[\s.-]+/g, '')
     const appleMatch = appleSanitized.match(/W\d{9,10}/i)
     if (v.includes('apple') || appleMatch) {
       return appleMatch ? appleMatch[0].toUpperCase() : appleSanitized.toUpperCase()
     }

     const nikeSanitized = clean.replace(/[\s.]+/g, '')
     const nikeMatch = nikeSanitized.match(/C[0-]\d{9,11}/i)
     if (v.includes('nike') || nikeMatch) {
       const matched = nikeMatch ? nikeMatch[0] : nikeSanitized
       return matched.toUpperCase()
     }
     ```

---

## 5. Verification Method

To reproduce and verify the fixes:
```bash
# 1. Run adversarial test suite
node --test tests/adversarial-canonical-order-resolver.test.mjs

# 2. Run existing canonical order resolver and vendor transaction tests
node --test tests/canonical-order-resolver.test.mjs tests/vendor-transaction-producer.test.mjs

# 3. Run full test suite
npm test
```
Invalidation condition: All 10 adversarial test suites in `tests/adversarial-canonical-order-resolver.test.mjs` must pass with 0 failures, 0 uncaught exceptions, and 100% pass on all existing tests.
