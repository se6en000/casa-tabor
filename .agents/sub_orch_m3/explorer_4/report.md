# Remediation Plan: Milestone 3 — Deterministic Entity & Canonical Order Resolver (Iteration 2)

**Author**: Explorer 4 (Remediation Specialist)  
**Milestone**: Milestone 3 — Deterministic Entity & Canonical Order Resolver  
**Target Recipient**: Worker 2  
**Target Status**: `ACTION_REQUIRED`  

---

## 1. Observation

Direct empirical observations from test runs, live runtime inspections, and challenger audit reports:

### Finding 1: Unhandled `RangeError: Invalid time value` in Client Date Utilities
- **File**: `/Users/taboj/casa-tabor/src/utils/vendorTransactions.ts`
- **Location 1 (Line 1187)**:
  ```typescript
  const rawEta = item.etaDisplay || item.rawEta || (etaMatch ? etaMatch[0].trim() : (deliveryDateObj ? format(deliveryDateObj, 'EEE, MMM d') : null))
  ```
  `deliveryDateObj` is created via `new Date(item.deliveryDate)`. When `item.deliveryDate` is malformed (e.g. `'not-a-date'`), `deliveryDateObj` is an `Invalid Date` object (`typeof === 'object'`). In JavaScript, `Boolean(new Date('invalid')) === true`. Calling `format(deliveryDateObj, ...)` throws unhandled `RangeError: Invalid time value`.
- **Location 2 (Lines 997, 1010, 1020)**:
  In `formatDeliveryEta`:
  ```typescript
  if (now) {
    const diff = differenceInCalendarDays(deliveryDate, now) // Throws RangeError if deliveryDate or now is Invalid Date
  ```
- **Location 3 (Lines 1078, 1079)**:
  In `buildDeliveryTransitItem`:
  ```typescript
  const rawEta = etaMatch ? etaMatch[0].trim() : (targetDate ? format(targetDate, 'EEE, MMM d') : ...)
  ```
- **Verification via CLI**:
  ```bash
  node -e "import('./src/utils/vendorTransactions.ts').then(vt => vt.resolveCanonicalEntity({ event_title: 'Order', deliveryDate: 'not-a-date' }))"
  # Output: CRASHED: Invalid time value (RangeError)
  ```

---

### Finding 2: Apple and Nike Order Number Thread Key Divergence on Interior Whitespace & Punctuation
- **Files**:
  - `/Users/taboj/casa-tabor/supabase/functions/_shared/canonical-order-resolver.mjs:77-86`
  - `/Users/taboj/casa-tabor/src/utils/vendorTransactions.ts:69-78`
- **Current Implementation**:
  ```javascript
  const appleMatch = clean.match(/W\d{9,10}/i)
  if (v.includes('apple') || appleMatch) {
    return appleMatch ? appleMatch[0].toUpperCase() : clean.toUpperCase()
  }
  const nikeMatch = clean.match(/C[0-]\d{9,11}/i)
  if (v.includes('nike') || nikeMatch) {
    const matched = nikeMatch ? nikeMatch[0] : clean
    return matched.toUpperCase()
  }
  ```
- **Observed Failure**:
  When order numbers contain interior spaces or non-breaking spaces (e.g., `'W 123456789'` or `'C0 123456789'`), `\d` does not match `\s`. Fallback returns `'W 123456789'`, causing thread key divergence:
  - `buildCompositeThreadKey({ vendor: 'Apple', orderId: 'W123456789' })` $\rightarrow$ `'transaction:apple:w123456789'`
  - `buildCompositeThreadKey({ vendor: 'Apple', orderId: 'W 123456789' })` $\rightarrow$ `'transaction:apple:w-123456789'`
  The two messages fail to consolidate into the same lifecycle entity.

---

### Finding 3: Chronological Cost and Policy Overwriting in `mergeDeliveryTransitItem`
- **File**: `/Users/taboj/casa-tabor/src/utils/vendorTransactions.ts:743,746`
- **Current Implementation**:
  ```typescript
  const mergedCost = incoming.cost || existing.cost || null
  const mergedPolicy = incoming.policyDisclaimer || existing.policyDisclaimer || null
  ```
- **Observed Failure**:
  When an older message (e.g. order confirmation with initial estimate `$120.00` at $T=0$) arrives or is merged after a newer message (e.g. delivered receipt with final total `$138.65` at $T=1$), `incoming.cost` blindly overwrites `existing.cost`.
- **Verification via CLI**:
  ```
  Merged cost (expected $138.65): $120.00
  Merged policy (expected Must claim in 3 days): Old estimate policy
  ```

---

### Finding 4: Contract Parity Discrepancy in `isPerishableDelivery`
- **Files**:
  - `/Users/taboj/casa-tabor/supabase/functions/_shared/canonical-order-resolver.mjs:576-586`
  - `/Users/taboj/casa-tabor/src/utils/vendorTransactions.ts:890-892`
- **Current Implementation in `vendorTransactions.ts`**:
  ```typescript
  const text = (typeof item === 'string' ? item : `${item.event_title ?? ''} ${item.description ?? ''} ${item.attention_vendor ?? ''}`).toLowerCase()
  ```
- **Observed Failure**:
  When passed object payloads using `title` or `vendor` (e.g., `{ title: 'Thanks for your InHome delivery order, Jacob', vendor: 'Walmart' }`), `canonical-order-resolver.mjs` returned `isPerishable: true`, whereas `vendorTransactions.ts` evaluated `undefined undefined undefined` and returned `isPerishable: false`.

---

### Finding 5: Promotional Noise Routing into Inbound Transit Feed in `splitActionableAndTransitItems`
- **File**: `/Users/taboj/casa-tabor/src/utils/needsYouFeed.ts:82-88`
- **Current Implementation**:
  ```typescript
  for (const item of items) {
    if (item.agency_level === 0 || isDeliveryTransitItem(item)) {
      rawTransitItems.push(buildDeliveryTransitItem(item))
    } else {
      actionableItems.push(item)
    }
  }
  ```
- **Observed Failure**:
  Any non-actionable item (`agency_level === 0`), including marketing emails (e.g., `BM-NOI-01` through `BM-NOI-05`) or estate bulletins, is converted into a `DeliveryTransitItem` with thread keys like `delivery:williams-sonoma:...` or `transaction:parcel:...` instead of being skipped.
- **Verification via CLI**:
  ```
  Actionable items (expected 0): 0
  Transit items (expected 0): 1  # Fails! Should be 0
  ```

---

## 2. Logic Chain

1. **Date Validity & Null Safety**:
   - `resolveCanonicalEntity` and `buildDeliveryTransitItem` accept arbitrary strings from email headers and API payloads.
   - Using `new Date(str)` on unparseable strings produces an `Invalid Date` object where `isNaN(d.getTime()) === true`.
   - `date-fns` functions (`format`, `differenceInCalendarDays`, `isBefore`) unconditionally access date methods that throw `RangeError: Invalid time value`.
   - Guarding date operations with `const isValidDate = d instanceof Date && !isNaN(d.getTime())` guarantees that malformed dates degrade gracefully to `null` or raw ETA strings without crashing.

2. **Whitespace and Character Normalization**:
   - Order IDs in real-world emails often include non-breaking spaces (`\u00A0`), regular spaces, hyphens, and periods introduced by HTML layout tables.
   - Stripping internal whitespace and punctuation (`clean.replace(/[\s.-]+/g, '')`) before regex pattern matching for Apple (`W\d{9,10}`) and Nike (`C[0-]\d{9,11}`) guarantees that variations like `'W 123456789'`, `'w-123456789'`, and `'W123456789'` resolve to the exact same canonical string `'W123456789'`.

3. **Temporal Field Precedence in Item Merging**:
   - In distributed inbox polling, delivery receipts can be processed prior to delayed shipping confirmations.
   - Stage progression already implements monotonic ranking (`incomingRank > existingRank`).
   - Field merging (`cost`, `policyDisclaimer`, `rawItem`, `occurredAt`) must similarly adhere to chronological precedence:
     `isLatestIncoming = (new Date(incoming.occurredAt).getTime() || 0) >= (new Date(existing.occurredAt).getTime() || 0)`
   - When `isLatestIncoming` is true, prefer `incoming.cost` over `existing.cost`. When false, preserve `existing.cost` over `incoming.cost`.

4. **Multi-Tier Property Normalization**:
   - Background tasks, client stores, and edge functions exchange entity representations using both standard database column names (`event_title`, `attention_vendor`) and UI object properties (`title`, `vendor`).
   - Normalizing property lookups across both modules `(item.event_title || item.title || '')` and `(item.vendor || item.attention_vendor || '')` guarantees 100% contract parity.

5. **Action Queue and Transit Feed Partitioning**:
   - The condition `item.agency_level === 0 || isDeliveryTransitItem(item)` conflated "passive item" with "inbound parcel delivery".
   - Non-actionable items (`agency_level === 0`) that are NOT deliveries (e.g. promotional sales, generic newsletters) belong in neither the Action Queue nor the Inbound Manifest.
   - Testing `if (isDeliveryTransitItem(item)) { push to transit } else if (item.agency_level !== 0) { push to actionable }` cleanly segregates deliveries, captures actionable tasks, and silently ignores marketing noise.

---

## 3. Caveats

- **Core Architecture Verified**: The multi-vendor canonical identity schema, lifecycle monotonicity rules, future arrival date guardrails, past courier auto-resolution, and 0% Executive Action Queue leakage passed 100% of stress tests.
- **Scope Calibration**: Remediation is strictly scoped to the 5 identified areas across `src/utils/vendorTransactions.ts`, `supabase/functions/_shared/canonical-order-resolver.mjs`, and `src/utils/needsYouFeed.ts`.

---

## 4. Conclusion & Precise Remediation Plan for Worker 2

Worker 2 must apply the following exact code changes:

### Change 1: Date Validity Safety & Parity in `src/utils/vendorTransactions.ts`

#### A. In `canonicalizeOrderId` (Lines 69–86):
Replace Apple, Nike, and meal kit normalizers with sanitized regex extraction:
```typescript
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

  const mealKitMatch = clean.match(/(?:HF|GC|BA|FACT)-\d{6,10}/i)
  if (mealKitMatch) {
    return mealKitMatch[0].toUpperCase()
  }
```

#### B. In `normalizeKeyPart` (Lines 39–41):
Ensure null/undefined safety:
```typescript
export function normalizeKeyPart(value: string | null | undefined) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
```

#### C. In `mergeDeliveryTransitItem` (Lines 742–757):
Respect chronological ordering for cost, policy disclaimers, and raw items:
```typescript
  const incomingTime = incoming.occurredAt ? new Date(incoming.occurredAt).getTime() : 0
  const existingTime = existing.occurredAt ? new Date(existing.occurredAt).getTime() : 0
  const isLatestIncoming = (isNaN(incomingTime) ? 0 : incomingTime) >= (isNaN(existingTime) ? 0 : existingTime)

  const mergedCost = isLatestIncoming
    ? (incoming.cost || existing.cost || null)
    : (existing.cost || incoming.cost || null)
  const mergedSummary = mergeItemSummary(existing.itemSummary, incoming.itemSummary)
  const mergedEta = mergeEtaDisplay(existing.etaDisplay, incoming.etaDisplay)
  const mergedPolicy = isLatestIncoming
    ? (incoming.policyDisclaimer || existing.policyDisclaimer || null)
    : (existing.policyDisclaimer || incoming.policyDisclaimer || null)

  const newerDate = isLatestIncoming ? incoming.occurredAt : existing.occurredAt
  const latestRawItem = isLatestIncoming ? incoming.rawItem : existing.rawItem
```

#### D. In `isPerishableDelivery` (Lines 890–910):
Support both `event_title`/`attention_vendor` and `title`/`vendor`:
```typescript
export function isPerishableDelivery(
  item: PrepItem | Partial<PrepItem> | { title?: string; vendor?: string; description?: string; event_title?: string; attention_vendor?: string } | string | null | undefined
): boolean {
  if (!item) return false
  let combined = ''
  if (typeof item === 'string') {
    combined = item.toLowerCase()
  } else if (typeof item === 'object') {
    const desc = (item as any).description || ''
    const title = (item as any).event_title || (item as any).title || ''
    const vendor = (item as any).vendor || (item as any).attention_vendor || ''
    combined = `${vendor} ${title} ${desc}`.toLowerCase()
  }

  return (
    combined.includes('inhome') ||
    combined.includes('hellofresh') ||
    combined.includes('hello fresh') ||
    combined.includes('greenchef') ||
    combined.includes('green chef') ||
    combined.includes('factor75') ||
    combined.includes('factor 75') ||
    combined.includes('blue apron') ||
    combined.includes('blueapron') ||
    combined.includes('meal kit') ||
    combined.includes('instacart') ||
    combined.includes('perishable') ||
    combined.includes('refrigerat') ||
    combined.includes('fresh') ||
    combined.includes('grocer') ||
    combined.includes('produce')
  )
}
```

#### E. In `resolveEffectiveStage` (Lines 946–982):
Guard invalid dates:
```typescript
export function resolveEffectiveStage(
  rawStage: DeliveryTransitStage,
  deliveryDate: Date | null,
  now?: Date
): DeliveryTransitStage {
  if (rawStage === 'problem') {
    return rawStage
  }
  const isValidDeliveryDate = deliveryDate instanceof Date && !isNaN(deliveryDate.getTime())
  const isValidNow = now instanceof Date && !isNaN(now.getTime())
  if (!isValidDeliveryDate || !isValidNow) {
    return rawStage
  }

  const todayStart = startOfDay(now)
  const deliveryStart = startOfDay(deliveryDate)

  if (isBefore(todayStart, deliveryStart)) {
    if (rawStage === 'delivered') {
      return 'confirmed'
    }
    return rawStage
  }

  if (isBefore(deliveryStart, todayStart)) {
    if (rawStage === 'out_for_delivery') {
      return 'delivered'
    }
  }

  return rawStage
}
```

#### F. In `formatDeliveryEta` (Lines 984–1026):
Guard invalid dates:
```typescript
export function formatDeliveryEta(
  rawEta: string | null,
  deliveryDate: Date | null,
  stage: DeliveryTransitStage,
  now?: Date
): string | null {
  if (stage === 'problem') {
    return 'Delivery exception'
  }

  const isValidDeliveryDate = deliveryDate instanceof Date && !isNaN(deliveryDate.getTime())
  const isValidNow = now instanceof Date && !isNaN(now.getTime())

  if (stage === 'delivered') {
    if (!isValidDeliveryDate) return 'Delivered'
    if (isValidNow) {
      const diff = differenceInCalendarDays(deliveryDate, now)
      if (diff === 0) return 'Delivered today'
      if (diff === -1) return 'Delivered yesterday'
      if (diff < -1) return `Delivered ${format(deliveryDate, 'MMM d')}`
    }
    return `Delivered ${format(deliveryDate, 'MMM d')}`
  }

  if (!isValidDeliveryDate) {
    return rawEta || null
  }

  if (isValidNow) {
    const diff = differenceInCalendarDays(deliveryDate, now)
    if (diff === 0) {
      return rawEta || 'Today'
    }
    if (diff === 1) {
      return rawEta ? `Tomorrow (${rawEta})` : 'Tomorrow'
    }
    if (diff > 1) {
      return format(deliveryDate, 'EEE, MMM d')
    }
    if (isBefore(deliveryDate, startOfDay(now))) {
      return `Delivered ${format(deliveryDate, 'MMM d')}`
    }
  }

  return rawEta || format(deliveryDate, 'EEE, MMM d')
}
```

#### G. In `isItemArrivingToday` & `isItemScheduledLater` (Lines 1028–1043):
Guard invalid date comparisons:
```typescript
export function isItemArrivingToday(item: DeliveryTransitItem, now: Date): boolean {
  const targetDate = resolveDeliveryDate(item.rawItem)
  const effectiveStage = resolveEffectiveStage(item.stage, targetDate, now)
  if (effectiveStage === 'delivered' || effectiveStage === 'problem') return false
  if (!targetDate || isNaN(targetDate.getTime()) || !now || isNaN(now.getTime())) return false
  return isSameDay(targetDate, now)
}

export function isItemScheduledLater(item: DeliveryTransitItem, now: Date): boolean {
  const targetDate = resolveDeliveryDate(item.rawItem)
  const effectiveStage = resolveEffectiveStage(item.stage, targetDate, now)
  if (effectiveStage === 'delivered' || effectiveStage === 'problem') return false
  if (!targetDate || isNaN(targetDate.getTime()) || !now || isNaN(now.getTime())) return false
  return isBefore(startOfDay(now), startOfDay(targetDate))
}
```

#### H. In `buildDeliveryTransitItem` (Lines 1076–1080):
Guard invalid `targetDate`:
```typescript
  const isValidTargetDate = targetDate instanceof Date && !isNaN(targetDate.getTime())
  const rawEta = etaMatch
    ? etaMatch[0].trim()
    : isValidTargetDate
      ? format(targetDate, 'EEE, MMM d')
      : item.due_by && !isNaN(new Date(item.due_by).getTime())
        ? new Date(item.due_by).toLocaleDateString()
        : null
  const etaDisplay = now
    ? formatDeliveryEta(rawEta, targetDate, effectiveStage, now)
    : rawEta || (isValidTargetDate ? format(targetDate, 'EEE, MMM d') : null)
```

#### I. In `resolveCanonicalEntity` (Lines 1167–1189):
Guard invalid `deliveryDateObj`:
```typescript
  const rawStage = (transactionStage(item as PrepItem) || 'confirmed') as DeliveryTransitStage
  const deliveryDateObj = item.deliveryDate ? new Date(item.deliveryDate) : (item.due_by ? new Date(item.due_by) : item.event_date ? new Date(item.event_date) : null)
  const isValidDateObj = deliveryDateObj instanceof Date && !isNaN(deliveryDateObj.getTime())
  const deliveryDateIso = isValidDateObj ? deliveryDateObj.toISOString().slice(0, 10) : null
  const effectiveStage = resolveEffectiveStage(rawStage, isValidDateObj ? deliveryDateObj : null, now)
  ...
  const rawEta = item.etaDisplay || item.rawEta || (etaMatch ? etaMatch[0].trim() : (isValidDateObj ? format(deliveryDateObj, 'EEE, MMM d') : null))
  const etaDisplay = formatDeliveryEta(rawEta, isValidDateObj ? deliveryDateObj : null, effectiveStage, now)
```

---

### Change 2: Shared Canonical Order Resolver Sanitization in `supabase/functions/_shared/canonical-order-resolver.mjs`

#### In `canonicalizeOrderId` (Lines 77–86):
Sanitize whitespace and punctuation for Apple and Nike:
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

### Change 3: Inbound Feed Non-Delivery Filtering in `src/utils/needsYouFeed.ts`

#### In `splitActionableAndTransitItems` (Lines 82–88):
```typescript
export function splitActionableAndTransitItems(items: PrepItem[]): {
  actionableItems: PrepItem[]
  deliveryTransitItems: DeliveryTransitItem[]
} {
  const actionableItems: PrepItem[] = []
  const rawTransitItems: DeliveryTransitItem[] = []

  for (const item of items) {
    if (isDeliveryTransitItem(item)) {
      rawTransitItems.push(buildDeliveryTransitItem(item))
    } else if (item.agency_level !== 0) {
      actionableItems.push(item)
    }
  }

  return {
    actionableItems,
    deliveryTransitItems: consolidateTransitItems(rawTransitItems),
  }
}
```

---

## 5. Verification Method

To independently verify all remediation items and certify regression safety:

```bash
# 1. Run Challenger adversarial test suite (12 tests)
node --test tests/adversarial-canonical-order-resolver.test.mjs

# 2. Run Milestone 3 unit tests
node --test tests/canonical-order-resolver.test.mjs tests/vendor-transaction-producer.test.mjs

# 3. Run E2E Email Intelligence multi-tier suite (129 tests)
node --test tests/e2e-email-intelligence-tiers.test.mjs

# 4. Run full project regression suite (1,877+ tests)
npm test

# 5. Run production TypeScript build
npm run build
```

### Invalidation Conditions
1. Any `RangeError: Invalid time value` exception when parsing or formatting dates.
2. Divergence between `Apple W123456789` and `Apple W 123456789` composite thread keys.
3. Out-of-order `mergeDeliveryTransitItem` overwriting a newer price with an older estimate.
4. `isPerishableDelivery` returning `false` on objects with `{ title, vendor }`.
5. Promotional emails with `agency_level: 0` appearing in `deliveryTransitItems`.
6. Any failure across `npm test` or `npm run build`.
