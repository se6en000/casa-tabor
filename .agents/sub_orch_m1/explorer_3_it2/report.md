# Milestone 1 Iteration 2: Empirical Investigation & Architecture Design Report

**Author**: Explorer 3 (Investigator, Analyzer, Synthesizer)  
**Date**: 2026-08-23  
**Milestone**: Milestone 1 (Historical Corpus Harvester & Semantic Clusterer — Iteration 2)  
**Target Files**:
- `supabase/functions/_shared/email-clusterer.mjs`
- `scripts/harvest-historical-email-corpus.mjs`
- `tests/email-harvester-clusterer.test.mjs`
- `tests/adversarial-clusterer.test.mjs`
- `tests/email-clusterer-stress.test.mjs`
- `tests/test-merchant-promo-leakage.mjs`
- `tests/test-pii-obfuscation-deep.mjs`

---

## 1. Executive Summary

During Milestone 1 Iteration 1, an initial harvesting and clustering pipeline was established with high baseline throughput (>20,000 emails/sec) and zero non-merchant executive action leakage. However, independent adversarial evaluation by Challenger 1 and Challenger 2 revealed **four concrete vulnerabilities**:

1. **Past-Due Utility Bill Action Escapement (`executive_actions` -> `lifecycle_updates`)**:
   In `evaluateDeterministicHeaders()`, utility billing notices containing standard past-due warning language (*"pay now to avoid disruption of service"*) match the outage rule (`/\b(outage|service restored|grid maintenance|disruption)\b/`) before billing rules are evaluated. This drops benchmark accuracy to **97.25%** (violating the **>= 98.0%** threshold in §R5/Acceptance Criteria) and suppresses critical billing alerts from the household action queue.
2. **Retailer Promotional Short-Circuit (100% Promo Leakage into Logistics)**:
   Tier 1 logistics fast-path matches retailer domain names (`amazon`, `walmart`, `chewy`, `hellofresh`, `blueapron`, `instacart`, `doordash`) unconditionally, routing 100% of marketing deals, sales circulars, and coupons into `logistics_parcels` with `0.97` confidence before promotional rules or NLP scoring can run.
3. **PII Sanitization & Data Structure Leakage**:
   - Regex gaps leaked dot/underscore SSNs (`123.45.6789`), dot-separated credit cards (`4111.2222.3333.4444`), international phone numbers (`+44`, `+33`, `+81`), and PO Box addresses (`PO Box 4920`) (77.1% pass rate on 35-vector matrix).
   - `clusterEmailCorpus()` spread unredacted `email.snippet` and `email.to` objects into output records, leaking raw PII.
4. **Shallow Nested Forward Message Header Stripping**:
   `fullText.indexOf('---------- forwarded message ---------')` matched only the outermost forward header, failing to unwrap multi-hop forwarded threads.

This report delivers the complete architectural design and code diff proposals to resolve all four vulnerabilities, and designs the unified test suite integration into `tests/email-harvester-clusterer.test.mjs` to guarantee **100% PII redaction**, **0% promotional leakage**, and **>= 99.0% accuracy** across all test suites.

---

## 2. Deep Dive 1: Utility Bill / Disconnection Precedence Fix

### 2.1 Problem Analysis & Failure Mechanism

In `supabase/functions/_shared/email-clusterer.mjs:822-832`:
```javascript
// Current flawed implementation:
// 6. Utilities & Financial
if (/fpl\.com|pbcwater\.org|chase\.com|americanexpress\.com/.test(from)) {
  if (/\b(outage|service restored|grid maintenance|disruption)\b/.test(analyzedText)) {
    return { archetype: 'lifecycle_updates', subCategory: 'utility_service_outage', confidence: 0.96, agencyLevel: 0 }
  }
  if (/\b(bill is ready|statement available|payment due|balance due|past due|amount due|bill due|pay by)\b/.test(analyzedText)) {
    return { archetype: 'executive_actions', subCategory: 'bill_invoice_due', confidence: 0.97, agencyLevel: 2 }
  }
  if (/\b(fraud alert|suspicious activity|verify transaction)\b/.test(analyzedText)) {
    return { archetype: 'executive_actions', subCategory: 'form_signature', confidence: 0.98, agencyLevel: 3 }
  }
}
```

When Florida Power & Light (FPL) sends:
> **Subject**: `Your FPL Electric Statement is Ready - Amount Due: $218.45`  
> **Body**: `Your electric bill is past due. Amount due: $218.45. Pay now at https://fpl.com/pay to avoid disruption.`

The word `"disruption"` matches `/\b(outage|service restored|grid maintenance|disruption)\b/` in line 823. The function immediately returns `{ archetype: 'lifecycle_updates', subCategory: 'utility_service_outage', confidence: 0.96, agencyLevel: 0 }`, bypassing line 826.

In the 1,200-sample gold benchmark in `tests/email-clusterer-stress.test.mjs`, all 33 misclassifications (causing 16.5% failure on executive actions) stem directly from this collision.

### 2.2 Architectural Solution: 4-Stage Precedence Hierarchy

The evaluation order within Utility & Financial senders must follow an inverted, priority-ordered decision cascade:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Stage 1: Critical Security & Fraud Alerts (agencyLevel: 3)                  │
│ Regex: /\b(fraud alert|suspicious activity|verify transaction|             │
│            account locked|unauthorized activity|security alert)\b/i        │
│ ➔ archetype: 'executive_actions', subCategory: 'form_signature'            │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ (no match)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Stage 2: Invoices, Bills, Past-Due, Disconnection, Shutoff (agencyLevel 2/3)│
│ Regex: /\b(bill is ready|statement available|payment due|balance due|       │
│            past due|amount due|bill due|pay by|pay now|shutoff|shut-off|     │
│            disconnection|disconnect notice|service disconnection|           │
│            interruption of service|avoid disruption|final notice|           │
│            overdue balance|late fee|action required.*pay)\b/i               │
│ ➔ archetype: 'executive_actions', subCategory: 'bill_invoice_due'          │
│   (agencyLevel: 3 if past-due/shutoff/disconnection/final notice, else 2)   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ (no match)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Stage 3: Operational Power/Water Outages (agencyLevel: 0)                   │
│ Regex: /\b(power outage|water outage|outage alert|outage map|               │
│            service restored|grid maintenance|rolling blackout|boil water|   │
│            power restoration|storm outage|outage)\b/i                       │
│ ➔ archetype: 'lifecycle_updates', subCategory: 'utility_service_outage'    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ (no match)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Stage 4: Informational Tips & Maintenance Notices (agencyLevel: 0)          │
│ Regex: /\b(energy saving|efficiency guide|preparedness guide|handbook)\b/i │
│ ➔ archetype: 'estate_knowledge', subCategory: 'utility_service_notice'      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Exact Code Replacement for `supabase/functions/_shared/email-clusterer.mjs`

```javascript
  // 6. Utilities & Financial
  if (/fpl\.com|pbcwater\.org|chase\.com|americanexpress\.com/.test(from)) {
    // 6a. Security & Fraud Alerts (Critical Escalation)
    if (/\b(fraud alert|suspicious activity|verify transaction|account locked|unauthorized activity|security alert)\b/i.test(analyzedText)) {
      return { archetype: 'executive_actions', subCategory: 'form_signature', confidence: 0.98, agencyLevel: 3 }
    }
    // 6b. Billing, Invoices, Past Due, Disconnection & Shutoff (Precedence over Outage keywords)
    if (/\b(bill is ready|statement available|payment due|balance due|past due|amount due|bill due|pay by|pay now|shutoff|shut-off|disconnection|disconnect notice|service disconnection|interruption of service|avoid disruption|final notice|overdue balance|late fee)\b/i.test(analyzedText)) {
      const isUrgent = /past due|shutoff|shut-off|disconnection|disconnect|avoid disruption|final notice|urgent/i.test(analyzedText)
      return { archetype: 'executive_actions', subCategory: 'bill_invoice_due', confidence: 0.98, agencyLevel: isUrgent ? 3 : 2 }
    }
    // 6c. True Operational Utility Outages & Lifecycle Restorations
    if (/\b(power outage|water outage|outage alert|outage map|service restored|grid maintenance|rolling blackout|boil water|power restoration|storm outage|outage)\b/i.test(analyzedText)) {
      return { archetype: 'lifecycle_updates', subCategory: 'utility_service_outage', confidence: 0.96, agencyLevel: 0 }
    }
    // 6d. Informational Estate Knowledge / Guides
    if (/\b(energy saving|efficiency tips|preparedness guide|resident handbook|community bulletin)\b/i.test(analyzedText)) {
      return { archetype: 'estate_knowledge', subCategory: 'utility_service_notice', confidence: 0.96, agencyLevel: 0 }
    }
  }
```

---

## 3. Deep Dive 2: Retailer Promotional Isolation vs Logistics Fast-Path

### 3.1 Problem Analysis & Failure Mechanism

In `supabase/functions/_shared/email-clusterer.mjs:753-772`:
The Tier 1 logistics rule matched retailer names in `from` headers (`walmart`, `amazon`, `chewy`, `hellofresh`, `blueapron`, `instacart`, `doordash`) unconditionally, returning `archetype: 'logistics_parcels'` with `confidence: 0.97 >= 0.90`.

Empirical testing on `tests/test-merchant-promo-leakage.mjs` resulted in a **100% misclassification rate (6/6 merchants)** for marketing emails (e.g. `$0 delivery fees with DashPass`, `Save 50% on Echo Dot`, `Rollbacks on electronics 40% off`).

### 3.2 Architectural Solution

1. **Domain Partitioning**:
   - **Couriers** (`ups.com`, `fedex.com`, `usps.com`, `dhl.com`, `ontrac.com`): Pure carrier domains route directly to logistics.
   - **Merchants** (`amazon`, `walmart`, `chewy`, `hellofresh`, `blueapron`, `instacart`, `doordash`, `target`, `nike`, `apple`): Hybrid senders that emit both parcel shipments and marketing promos.
2. **Promotional Pre-Screen**:
   If subject contains promotional tokens (`% off`, `sale`, `coupon`, `promo code`, `save $`, `deals`, `rollback`, `free meals`, `clearance`, `bogo`), the email is forbidden from entering the Tier 1 logistics fast-path and is directed to Tier 1 promotional classification or Tier 2 NLP intent scoring.
3. **Explicit Transactional Requirement**:
   Retailers only qualify for Tier 1 logistics if the subject contains explicit shipping or order tokens:
   `/\b(tracking number|your order has shipped|order has shipped|package delivered|delivered|out for delivery|order confirmation|order confirmed|inhome delivery|your delivery|order details|receipt for order|order #\d+)\b/i`.

### 3.3 Exact Code Replacement for `supabase/functions/_shared/email-clusterer.mjs`

```javascript
  // 2. High-Confidence Logistics / Courier Senders
  const isCourierSender = /ups\.com|fedex\.com|usps\.com|dhl\.com|ontrac\.com/.test(from)
  const isMerchantSender = /walmart|amazon|chewy|hellofresh|blueapron|instacart|doordash|target\.com|nike\.com|apple\.com/.test(from)
  const isTransactionalSubject = /\b(tracking number|your order has shipped|order has shipped|package delivered|delivered|out for delivery|order confirmation|order confirmed|inhome delivery|your delivery|order details|receipt for order|order #\d+)\b/i.test(analyzedSubject)
  const hasPromoInSubject = /\b(\d+%\s*off|percent off|flash sale|clearance|promo code|coupon code|save\s*\$|exclusive deal|doorbuster|shop now|buy one get one|bogo|deals|rollback|rollbacks|free meals|save big|weekly circular)\b/i.test(analyzedSubject)

  if (
    (isCourierSender && !hasPromoInSubject) ||
    (isMerchantSender && isTransactionalSubject && !hasPromoInSubject) ||
    (isTransactionalSubject && !hasPromoInSubject)
  ) {
    // Check for delay / exception
    if (/\b(delayed|exception|delivery attempted|address issue|weather delay|out of stock|item cancelled|item canceled|substituted)\b/i.test(analyzedText)) {
      const sub = /\b(item cancelled|out of stock|substituted)\b/i.test(analyzedText) ? 'order_item_cancellation' : 'delivery_delay_exception'
      return { archetype: 'lifecycle_updates', subCategory: sub, confidence: 0.96, agencyLevel: 1 }
    }
    // E-commerce or courier delivery
    let sub = 'ecommerce_order'
    if (/walmart.*inhome|inhome|instacart|doordash|groceries/.test(analyzedText) || /inhome|instacart/.test(from)) {
      sub = 'grocery_delivery'
    } else if (/hellofresh|blueapron|meal kit/.test(analyzedText) || /hellofresh|blueapron/.test(from)) {
      sub = 'meal_kit'
    } else if (isCourierSender || /\b(courier|tracking|1z[0-9a-z]{16})\b/i.test(analyzedText)) {
      sub = 'courier_tracking'
    }
    return { archetype: 'logistics_parcels', subCategory: sub, confidence: 0.97, agencyLevel: 0 }
  }
```

---

## 4. Deep Dive 3: PII Sanitization & Data Structure Security

### 4.1 Regex Enhancements in `redactEmailPII()`

| Category | Vulnerable Format | Enhanced Regex Pattern | Replacement Output |
|---|---|---|---|
| **SSN** | `123.45.6789`, `123_45_6789`, `SSN: 123456789` | `/\b\d{3}[- ._]\d{2}[- ._]\d{4}\b/g` and `/\b(?:SSN\|Social Security(?: Number)?)\s*[:#-]?\s*(\d{9}\|\d{3}[- ._]\d{2}[- ._]\d{4})\b/gi` | `[SSN_REDACTED]` |
| **Credit Cards** | `4111.2222.3333.4444` | `/\b(?:\d[ -.]*?){13,19}\b/g` (with Luhn & length filter, preserving 20+ digit USPS tracking) | `[CARD_REDACTED]` |
| **Phone Numbers** | `+44 20 7946 0919`, `+33 1 42 68 55 00`, `+81 3 1234 5678`, `5615550199` | `/(?<!\w)(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})(?:\s*(?:ext\|x\|ext\.)\s*\d{1,5})?(?!\w)/g` and `/(?<!\w)\+\d{1,3}(?:[-.\s]?\(?\d{1,4}\)?){1,4}[-.\s]?\d{1,4}(?!\w)/g` and `/\b(?:phone\|mobile\|cell\|tel\|fax\|call)\s*[:#-]?\s*([0-9]{10})\b/gi` | `[PHONE_REDACTED]` |
| **Street Addresses & PO Boxes** | `PO Box 4920, Palm Beach, FL 33480`, `Unit 4B, 123 Ocean Blvd` | `/\b(?:P\.?O\.?\s*Box\s+\d+\|Post\s+Office\s+Box\s+\d+)(?:,?\s+[A-Za-z\s]{2,30},?\s+(?:[A-Z]{2}\|[A-Za-z]+)\s+\d{5}(?:-\d{4})?)?\b/gi` and `/\b(?:(?:Apt\|Suite\|Ste\|Unit\|#)\s*[A-Za-z0-9-]+,?\s+)?\d{1,5}\s+(?:[A-Za-z0-9#.-]+\s+){1,5}(?:Street\|St\|Avenue\|Ave\|Boulevard\|Blvd\|Road\|Rd\|Drive\|Dr\|Lane\|Ln\|Court\|Ct\|Way\|Place\|Pl\|Circle\|Cir\|Terrace\|Ter\|Parkway\|Pkwy\|Trail\|Trl\|Highway\|Hwy\|Pike\|Row\|Loop\|Run\|Path)\.?(?:,?\s+(?:Apt\|Suite\|Ste\|Unit\|#)\s*[A-Za-z0-9-]+)?(?:,?\s+[A-Za-z\s]{2,30},?\s+(?:AL\|AK\|AZ\|AR\|CA\|CO\|CT\|DE\|FL\|GA\|HI\|ID\|IL\|IN\|IA\|KS\|KY\|LA\|ME\|MD\|MA\|MI\|MN\|MS\|MO\|MT\|NE\|NV\|NH\|NJ\|NM\|NY\|NC\|ND\|OH\|OK\|OR\|PA\|RI\|SC\|SD\|TN\|TX\|UT\|VT\|VA\|WA\|WV\|WI\|WY\|Florida\|Georgia\|New York\|California)\s+\d{5}(?:-\d{4})?)?\b/gi` | `[ADDRESS_REDACTED]` |

### 4.2 Data Structure Redaction in `clusterEmailCorpus()`

In `supabase/functions/_shared/email-clusterer.mjs:1123-1130`:
```javascript
    if (anonymize) {
      const anonymized = anonymizeEmail(email)
      redactionMeta = anonymized

      // Deep sanitize snippet, to, and personal headers
      const sanitizedSnippet = email.snippet
        ? redactEmailPII(email.snippet)
        : (anonymized.anonymizedText ? anonymized.anonymizedText.slice(0, 140) : '')

      const sanitizedTo = Array.isArray(email.to)
        ? email.to.map(t => redactEmailPII(t))
        : (email.to ? redactEmailPII(email.to) : email.to)

      const sanitizedFrom = email.from ? redactEmailPII(email.from) : email.from

      emailToClassify = {
        ...email,
        from: sanitizedFrom,
        to: sanitizedTo,
        subject: anonymized.anonymizedSubject,
        bodyText: anonymized.anonymizedText,
        snippet: sanitizedSnippet,
      }
      ...
```

### 4.3 Forwarded Message Deep Unwrapping

In `evaluateDeterministicHeaders()` (line 734):
```javascript
  // Nested Forwarded Message Deep Unwrapping
  let analyzedSubject = subject.replace(/^(?:fwd|re|fw):\s*/gi, '').trim()
  let analyzedText = fullText
  const fwdMarkers = [
    '---------- forwarded message ---------',
    '-----original message-----',
    'begin forwarded message:',
    '________________________________',
  ]
  for (const marker of fwdMarkers) {
    const idx = fullText.lastIndexOf(marker)
    if (idx !== -1) {
      analyzedText = fullText.slice(idx)
      break
    }
  }
```

---

## 5. Main Test Suite Integration Architecture

### 5.1 Structure of `tests/email-harvester-clusterer.test.mjs`

The updated `tests/email-harvester-clusterer.test.mjs` integrates all challenger test vectors into a comprehensive 10-section test suite:

```
tests/email-harvester-clusterer.test.mjs
├── Section 1: Corpus Generation & Scale Gate (1,000+ emails across Personal, Updates, Promo)
├── Section 2: 100% PII Redaction Matrix (35 vectors: dot/underscore SSN, dot CC, intl phones, PO Boxes)
├── Section 3: Clustered Data Structure PII Audit (snippet, to, from object sanitization)
├── Section 4: 0% Retailer Promotional Leakage (Amazon, Walmart, Chewy, Instacart, HelloFresh, DoorDash)
├── Section 5: Utility Bill / Disconnection Precedence (FPL past-due, shutoff vs grid outage)
├── Section 6: Nested Forward Message Deep Unwrapping (multi-hop Fwd: chains)
├── Section 7: Adversarial Prompt Injection & Bulk Header Conflicts (JSON, prompts, precedence)
├── Section 8: 1,200 Gold Standard Benchmark & 6x6 Confusion Matrix (>=99.0% accuracy, 0% leakage)
├── Section 9: Scale & Deduplication Stress (3,000 emails, <2.5ms latency, RFC/fallback dedup)
└── Section 10: Deterministic Entity Extraction & Canonical Order Resolvers (Amazon, Walmart, Apple, Nike)
```

### 5.2 Verification Matrix Across All Test Suites

| Test Suite | Purpose | Target Metric |
|---|---|---|
| `tests/email-harvester-clusterer.test.mjs` | Unified Master Test Suite | **100% pass**, **100% PII redaction**, **0% promo leakage**, **>= 99.0% accuracy** |
| `tests/adversarial-clusterer.test.mjs` | Challenger 1 Adversarial Suite | **100% pass**, 0 injection overrides, 0 prompt leaks |
| `tests/email-clusterer-stress.test.mjs` | Challenger 2 Scale & Benchmark Suite | **100% pass**, 3,000-email throughput > 500/s, 1,200 gold cases accuracy >= 99.0% |
| `tests/test-merchant-promo-leakage.mjs` | Retailer Isolation Script | **0% leakage** (6/6 merchants classified as `promotional_noise`) |
| `tests/test-pii-obfuscation-deep.mjs` | Deep PII Obfuscation Script | **100% pass rate** (35/35 vectors redacted, 0 leaks) |

---

## 6. Implementation Action Plan for Milestone 1 Planner & Worker

1. **Apply Code Edits to `supabase/functions/_shared/email-clusterer.mjs`**:
   - Update `evaluateDeterministicHeaders` utility/financial precedence (Stage 1-4).
   - Update `evaluateDeterministicHeaders` courier vs merchant promotional pre-filter.
   - Update `evaluateDeterministicHeaders` multi-hop forward unwrapper.
   - Update `redactEmailPII` regex patterns for SSN, cards, international phones, PO boxes, unit prefixes.
   - Update `clusterEmailCorpus` to sanitize `snippet`, `to`, and `from`.
2. **Apply Test Integration to `tests/email-harvester-clusterer.test.mjs`**:
   - Merge all 35 PII test vectors, 6 retailer promotional cases, and 1,200 gold benchmark confusion matrix tests into `tests/email-harvester-clusterer.test.mjs`.
3. **Execute Full Suite Verification**:
   - Run `node --test tests/email-harvester-clusterer.test.mjs tests/adversarial-clusterer.test.mjs tests/email-clusterer-stress.test.mjs`
   - Run `node tests/test-merchant-promo-leakage.mjs`
   - Run `node tests/test-pii-obfuscation-deep.mjs`
   - Confirm **0 failures**, **100% PII redaction**, **0% promo leakage**, and **>= 99.0% accuracy**.
