# Investigation & Design Report: 1,000+ Email Corpus Generation & Test Suite Methodology

**Author**: Explorer 3 (Milestone 1 — Historical Corpus Harvester & Semantic Clusterer)  
**Date**: 2026-08-23T11:49:00Z  
**Project**: Casa Tabor Autonomous Household Email Intelligence System  
**Working Directory**: `/Users/taboj/casa-tabor/.agents/sub_orch_m1/explorer_3/`

---

## Executive Summary

This report establishes the complete specification, synthetic generation architecture, edge-case taxonomy, and test methodology for Milestone 1: **Historical Corpus Harvester & Semantic Clusterer**.

To support rigorous verification without exposing real private family data in public test fixtures, the system implements a dual-mode corpus strategy:
1. **Deterministic 1,000+ Synthetic Corpus Generator**: Generates 1,050–1,200 diverse, realistic, highly structured emails across Gmail categories (`CATEGORY_PERSONAL`, `CATEGORY_UPDATES`, `CATEGORY_PROMOTIONS`, `CATEGORY_FORUMS`), spanning 30+ real-world household vendor domains (Amazon, Delta, UPS, School District, Pediatrician, HOA, Chase, Blue Apron, Target, etc.).
2. **Comprehensive Test Suite (`tests/email-harvester-clusterer.test.mjs`)**: Runs under Node.js native test runner (`node --test tests/*.test.mjs`), validating scale (>=1,000 emails), 100% PII redaction on sensitive seeds, 100% archetype coverage (0 unclassified), high precision/accuracy (>95% on gold benchmark), cross-mailbox deduplication, edge-case resilience, and high throughput (<1,500ms for 1,000 items).

---

## 1. Structure & Methodology of the 1,000+ Email Corpus Generator

### 1.1. Deterministic Seeding & Dual-Mode Pipeline
- **Deterministic PRNG**: Uses a seeded pseudo-random number generator (Mulberry32) with default seed `42` so tests are 100% reproducible and stable across machines and CI runs.
- **Dual-Mode Contract**:
  - `generateSyntheticCorpus(options)`: Generates full mock corpus offline for CI/CD and testing.
  - `harvestGmailInboxCorpus(auth, options)`: Live Gmail API batch harvester fetching real historical messages via Gmail REST API (`users.messages.list` + `users.messages.get?format=full`).
  - Both modes output normalized `StandardEmailMessage` objects feeding into the same clustering and PII anonymization pipeline.

### 1.2. Standardized Email Data Contract (`StandardEmailMessage`)

```typescript
export interface StandardEmailMessage {
  id: string;                         // Unique ID (e.g., "syn_msg_0001" or Gmail message ID)
  threadId: string;                   // Thread ID (e.g., "syn_thd_0001")
  messageId: string | null;           // RFC 2822 Message-ID (e.g., "<ord-9923@amazon.com>")
  inReplyTo?: string | null;          // For thread updates / replies
  references?: string[];              // RFC References
  from: string;                       // "Amazon.com <auto-confirm@amazon.com>"
  to: string[];                       // ["Michael Tabor <michael@taborfamily.net>"]
  cc?: string[];
  subject: string;                    // Subject line
  snippet: string;                    // 100-200 char preview snippet
  bodyText: string;                   // Plain text email content
  bodyHtml?: string;                  // Rich HTML formatted body
  internalDate: string;               // ISO-8601 string (e.g., "2026-08-15T14:30:00.000Z")
  labelIds: string[];                 // Gmail labels: ["INBOX", "CATEGORY_UPDATES"]
  mailboxOwner: string;               // "michael", "rachel", "shared"
  groundTruth?: {                     // Injected for test validation only
    archetype: 'logistics_parcels' | 'executive_actions' | 'temporal_appointments' | 'lifecycle_updates' | 'estate_knowledge' | 'promotional_noise';
    subCategory: string;
    agencyLevel: number;              // 0 (passive/radar) or 1 (action required)
    expectedEntities: {
      vendor?: string;
      orderId?: string;
      trackingNumber?: string;
      carrier?: 'ups' | 'fedex' | 'usps' | 'dhl';
      appointmentDate?: string;
      amountDue?: string;
      dueDate?: string;
      piiTokens?: string[];           // Known synthetic seed PII strings to check for 100% redaction
    };
  };
}
```

### 1.3. Gmail Category Distribution Breakdown (Total: 1,100 emails)

| Gmail Category Label | Count | Share | Typical Household Topics |
|---|---|---|---|
| `CATEGORY_PERSONAL` (Primary Inbox) | 360 | 32.7% | Doctor appointment confirmations, school permission slips, teacher messages, coach updates, legal forms, direct bills. |
| `CATEGORY_UPDATES` (Updates Tab) | 430 | 39.1% | E-commerce orders, courier tracking, airline gate changes, utility statements, HOA maintenance notices, bank alerts. |
| `CATEGORY_PROMOTIONS` (Promotions Tab) | 250 | 22.7% | Retail sales, coupons, brand newsletters, flash sales, restaurant discounts, loyalty points. |
| `CATEGORY_FORUMS` / `CATEGORY_SOCIAL` | 60 | 5.5% | HOA community bulletin, PTA discussion thread, neighborhood sports group emails. |
| **Total** | **1,100** | **100%** | **Comprehensive household email distribution** |

### 1.4. Archetype Distribution Matrix

| Archetype | Count | Target % | Sub-Categories & Content Examples |
|---|---|---|---|
| `logistics_parcels` | 240 | ~21.8% | E-commerce order placed (`amazon`, `target`, `walmart`, `nike`, `apple`, `chewy`), shipping confirmed (`ups`, `fedex`, `usps`), meal kit delivery (`hellofresh`, `blueapron`), grocery drop (`instacart`, `doordash`). |
| `executive_actions` | 195 | ~17.7% | Permission slips (`palmbeachschools.org`), liability waivers (`superstartennis.com`), bills/invoices (`fpl.com`, `pbcwater.org`, `schoolcashonline.com`), Docusign contract, annual HOA vote. |
| `temporal_appointments` | 195 | ~17.7% | Doctor/pediatrician checkup (`palmpediatrics.com`), dental cleaning (`smiledental.com`), flight itinerary (`delta.com`, `united.com`), tennis tournament schedule, school open house, parent-teacher conference. |
| `lifecycle_updates` | 155 | ~14.1% | Flight gate/delay change (`delta.com`), order delivery rescheduled (`amazon.com`), courier exception / delivery attempt (`ups.com`), meal kit ingredient substitution (`hellofresh.com`), backordered item update. |
| `estate_knowledge` | 165 | ~15.0% | HOA newsletter & community rules (`mirasolhoa.com`), AC quarterly maintenance service receipt (`superioracrepairs.com`), pool service log (`flpremierpools.com`), gate security code change, school general handbook update. |
| `promotional_noise` | 150 | ~13.6% | J.Crew 40% off sale (`jcrew.com`), Pottery Barn summer catalog (`potterybarn.com`), Best Buy weekend flash deals (`bestbuy.com`), Crate & Barrel newsletter, Bed Bath & Beyond coupon. |
| **Total** | **1,100** | **100%** | **0 Unclassified or Fallback Failures** |

### 1.5. Sender Domain Pool (32 Diverse Realistic Senders)

1. **Retail & E-commerce**: `auto-confirm@amazon.com`, `shipment-tracking@amazon.com`, `orders@target.com`, `help@walmart.com`, `shipping@walmart.com`, `order-status@nike.com`, `no_reply@email.apple.com`, `support@jiffyshirts.com`, `service@chewy.com`
2. **Couriers & Couriers**: `pkginfo@ups.com`, `trackingupdates@fedex.com`, `auto-reply@usps.com`, `donotreply_us@dhl.com`
3. **Meal Kits & Food Delivery**: `delivery@hellofresh.com`, `orders@blueapron.com`, `orders@instacart.com`, `receipts@doordash.com`
4. **Airlines, Hotels & Travel**: `ticketreceipt@delta.com`, `flightnotifications@delta.com`, `customercare@united.com`, `reservations@marriott.com`, `automated@airbnb.com`, `uber.us@uber.com`
5. **Schools & Youth Athletics**: `principal@palmbeachschools.org`, `notifications@schoolcashonline.com`, `director@floridayouthorchestra.org`, `coach@superstartennis.com`, `swim@pbaquatics.org`
6. **Healthcare & Pediatrics**: `appointments@palmpediatrics.com`, `no-reply@mychart.com`, `frontdesk@coastalortho.com`, `reminders@smiledental.com`
7. **Financial & Utilities**: `service@chase.com`, `fraudalerts@chase.com`, `notifications@americanexpress.com`, `ebill@fpl.com`, `billing@pbcwater.org`
8. **Estate & HOA**: `manager@mirasolhoa.com`, `service@superioracrepairs.com`, `support@flpremierpools.com`, `security@enverasystems.com`
9. **Promotions & Retail Brands**: `news@jcrew.com`, `specialoffers@potterybarn.com`, `deals@bestbuy.com`, `promotions@crateandbarrel.com`, `news@williams-sonoma.com`

---

## 2. Edge Cases Taxonomy & Synthetic Injection Patterns

The synthetic generator and test suite must explicitly cover 8 distinct classes of real-world email edge cases:

### 2.1. Unicode, Diacritics & International Scripts
- **Accented Names & Words**: "Renée Tabor", "François Müller", "Café Bustelo order", "Niño registration".
- **Non-Latin Scripts**: "Delta Flight Confirmation: 東京/成田 (NRT) -> Miami (MIA)", Cyrillic travel receipt, Arabic / Hebrew RTL text.
- **Emojis in Subject & Snippet**:
  - `📦 Your Amazon package is on the way! 🎉`
  - `⚠️ ACTION REQUIRED: Sign field trip permission slip 📝`
  - `✈️ United Flight UA492 Schedule Change 🕒`
  - `🦷 Reminder: Dental checkup tomorrow at 2 PM 🪥`
- **Invisible & Smart Characters**: Zero-width spaces (`\u200B`), non-breaking spaces (`\u00A0`), curly quotes (`“`, `”`, `‘`, `’`), em-dashes (`—`), en-dashes (`–`), mixed CRLF/LF newlines.

### 2.2. Empty Snippet, Empty Body & Image-Only Flyers
- **Empty Body with Descriptive Subject**: Subject: `"Emme violin rehearsal canceled today"`, Body: `""`. Must classify as `estate_knowledge` / `temporal_appointments` update based on subject alone.
- **Empty Subject with Descriptive Body**: Subject: `""`, Body: `"Your UPS package 1Z9999999999999999 will be delivered by 7:00 PM today."` Must classify as `logistics_parcels`.
- **Image-Only HTML Flyer**: Body: `<div align="center"><img src="https://assets.school.org/spring_carnival_flyer.jpg" alt="Spring Carnival May 15th"></div>`. Subject: `"Spring Carnival Flyer - Save the Date"`.
- **Whitespace-Only Content**: Body: `"   \t\r\n   "`. Must not trigger unhandled exceptions or infinite regex loops.

### 2.3. Malformed Headers & Missing Fields
- **Missing `Message-ID`**: Header `Message-ID` is missing, empty, or unparseable. The pipeline must fallback to `canonicalEmailKey` hash based on sender + subject + 10-minute bucket + body fingerprint (`fallback:sha256(...)`).
- **Malformed `From` Header**:
  - `From: "Michael Tabor" <michael@taborfamily.net>, <admin@taborfamily.net>` (multiple addresses)
  - `From: invalid-sender-without-brackets@domain.com`
  - `From: <no-domain>` or empty string `""`
- **Malformed `Date` Header**: Unparseable date strings (`"Yesterday afternoon"`, `"Invalid Date"`, unix epoch `0`). System must gracefully fall back to ingestion timestamp.

### 2.4. Nested Forwarded Threads & Quoted Chains
- **Forwarded Email Wrapper**:
  ```
  FYI please see the attached form we need to sign for Emme by Friday! - Michael
  
  ---------- Forwarded message ---------
  From: Principal Davis <principal@palmbeachschools.org>
  Date: Thu, Aug 20, 2026 at 9:00 AM
  Subject: Required Emergency Contact Form 2026-2027
  To: Michael Tabor <michael@taborfamily.net>
  
  Parents, please complete and return the attached emergency contact form.
  ```
  *Requirement*: Semantic clusterer must parse the forwarded inner context and correctly classify as `executive_actions`.
- **Quoted Reply Chain**: `> On Aug 18, 2026, at 4:15 PM, Coach Mark wrote:` followed by latest message content.

### 2.5. Multi-Category & Cross-Archetype Ambiguity
- **Promotional Email embedding an Urgent Bill / Form**: Retail newsletter containing "Your store credit card balance of $124.50 is past due. Pay now to avoid fees." -> Must detect high-priority action and route to `executive_actions`.
- **Doctor Appointment with Copay Payment Request**: "Pediatric checkup for Emme tomorrow at 3 PM. Copay of $35 is due online or upon arrival." -> Primary: `temporal_appointments`, with extracted payment metadata.
- **Logistics Delivery with Passive Return Policy Disclaimer**: "Your package 1Z992837192837 was delivered at front porch. Policy: items eligible for return within 30 days of receipt." -> **STRICT REQUIREMENT**: Must classify as `logistics_parcels` with `agencyLevel = 0`, guaranteeing **0% false leakage** into Executive Action Queue!

### 2.6. Extreme PII Density
- **High-Density PII Seed Sample**:
  ```
  CONFIDENTIAL PATIENT RECORD
  Parent: Michael Tabor (SSN: 123-45-6789, DOB: 05/14/1982)
  Patient: Emme Tabor (DOB: 04/12/2014, Patient ID: MED-88234)
  Home Address: 123 Ocean Boulevard, Apt 4B, Palm Beach, FL 33480
  Contact Phone: (561) 555-0199 / Mobile: +1-561-555-0144
  Personal Email: michael.tabor@private.com
  Billing: Visa ending in 4111-2222-3333-4444 (Exp: 09/28)
  Direct Deposit Routing: 021000021 Account: 9876543210
  Diagnosis: Routine Pediatric Wellness Exam
  ```
- *Requirement*: 100% of names, SSNs, dates of birth, street addresses, phone numbers, emails, credit card numbers, and bank account numbers MUST be stripped or replaced with safe tokens (`[NAME]`, `[SSN]`, `[ADDRESS]`, `[PHONE]`, `[EMAIL]`, `[CARD_NUMBER]`, `[ACCOUNT_NUMBER]`, or `[REDACTED]`).

### 2.7. Zero PII Automated Systems
- Emails containing zero personal identifiers (e.g. FPL Grid Maintenance alert, AWS status notice, GitHub changelog).
- *Requirement*: Anonymizer must not mangle or delete non-PII terms, vendor names, or dates.

### 2.8. Very Long & Multipart Payloads (>50KB)
- Oversized emails containing 500 lines of itemized parts or complex HTML tables.
- *Requirement*: Linear processing time (<10ms), safe character/token bounded chunking, zero catastrophic regex backtracking.

---

## 3. Test Suite Design (`tests/email-harvester-clusterer.test.mjs`)

The test suite will be located in `tests/email-harvester-clusterer.test.mjs` and executed via `node --test tests/email-harvester-clusterer.test.mjs` (and as part of the full `npm test` suite).

### 3.1. Test Suite Architecture & Scenarios

```javascript
// tests/email-harvester-clusterer.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  generateSyntheticCorpus,
  generateSyntheticEmail,
  KNOWN_PII_SEEDS,
} from '../scripts/harvest-historical-email-corpus.mjs'

import {
  classifyEmail,
  redactEmailPII,
  deduplicateEmailCorpus,
  extractEmailEntities,
} from '../supabase/functions/_shared/email-clusterer.mjs'

import {
  canonicalEmailKey,
  normalizeInternetMessageId,
} from '../supabase/functions/_shared/gmail-canonical-email.mjs'
```

### 3.2. Detailed Test Specifications

#### Test 1: Corpus Generation & Scale Gate (>= 1,000 emails)
```javascript
test('generates >= 1,000 realistic historical emails across all Gmail categories and diverse senders', () => {
  const corpus = generateSyntheticCorpus({ count: 1100, seed: 42 })
  assert.ok(corpus.length >= 1000, `Expected >= 1000 emails, got ${corpus.length}`)

  // Schema validation
  for (const email of corpus) {
    assert.ok(email.id, 'Email must have valid id')
    assert.ok(email.threadId, 'Email must have valid threadId')
    assert.ok(email.from, 'Email must have valid from address')
    assert.ok(email.subject !== undefined, 'Email must have subject field')
    assert.ok(email.internalDate, 'Email must have ISO internalDate')
    assert.ok(Array.isArray(email.labelIds), 'Email must have labelIds array')
  }

  // Category distribution checks
  const personal = corpus.filter(m => m.labelIds.includes('CATEGORY_PERSONAL')).length
  const updates = corpus.filter(m => m.labelIds.includes('CATEGORY_UPDATES')).length
  const promo = corpus.filter(m => m.labelIds.includes('CATEGORY_PROMOTIONS')).length
  assert.ok(personal >= 300, `Expected >= 300 Personal, got ${personal}`)
  assert.ok(updates >= 350, `Expected >= 350 Updates, got ${updates}`)
  assert.ok(promo >= 200, `Expected >= 200 Promotions, got ${promo}`)

  // Sender diversity
  const uniqueDomains = new Set(corpus.map(m => m.from.match(/@([a-z0-9.-]+)/i)?.[1]))
  assert.ok(uniqueDomains.size >= 25, `Expected >= 25 unique sender domains, got ${uniqueDomains.size}`)
})
```

#### Test 2: 100% PII Redaction Verification
```javascript
test('achieves 100% PII redaction on sensitive synthetic seeds', () => {
  const sensitiveCorpus = generateSyntheticCorpus({ count: 150, seed: 99, injectKnownPii: true })
  
  for (const email of sensitiveCorpus) {
    const piiSeeds = email.groundTruth?.expectedEntities?.piiTokens ?? []
    if (piiSeeds.length === 0) continue

    const redactedText = redactEmailPII(email.bodyText)
    const redactedSubject = redactEmailPII(email.subject)
    const combinedRedacted = `${redactedSubject}\n${redactedText}`

    for (const piiToken of piiSeeds) {
      assert.ok(
        !combinedRedacted.includes(piiToken),
        `PII leak detected! Found "${piiToken}" in redacted output for email ${email.id}`,
      )
    }
  }
})
```

#### Test 3: 100% Archetype Coverage & Zero Unclassified Failures
```javascript
test('accurately classifies 1,000+ emails across all 6 archetypes with 0 unclassified or fallback failures', () => {
  const corpus = generateSyntheticCorpus({ count: 1100, seed: 42 })
  const validArchetypes = new Set([
    'logistics_parcels',
    'executive_actions',
    'temporal_appointments',
    'lifecycle_updates',
    'estate_knowledge',
    'promotional_noise',
  ])

  const counts = {}
  for (const arch of validArchetypes) counts[arch] = 0

  for (const email of corpus) {
    const result = classifyEmail(email)
    assert.ok(validArchetypes.has(result.archetype), `Invalid or unclassified archetype: ${result.archetype}`)
    assert.ok(result.confidence >= 0.5 && result.confidence <= 1.0, `Invalid confidence score: ${result.confidence}`)
    counts[result.archetype]++
  }

  // Verify all 6 archetypes are represented (> 80 emails each in 1,100 corpus)
  for (const [arch, count] of Object.entries(counts)) {
    assert.ok(count >= 80, `Archetype ${arch} underrepresented: only ${count} instances`)
  }
})
```

#### Test 4: Classification Accuracy Gate (>95% on Labeled Holdout)
```javascript
test('achieves >= 95% classification accuracy on labeled ground-truth holdout benchmark', () => {
  const holdout = generateSyntheticCorpus({ count: 250, seed: 777, isGoldBenchmark: true })
  let correct = 0
  let actionLeakageCount = 0

  for (const item of holdout) {
    const result = classifyEmail(item)
    const expected = item.groundTruth.archetype
    if (result.archetype === expected) correct++

    // 0% false leakage check: logistics/policy disclaimers must never leak into executive_actions
    if (expected === 'logistics_parcels' && result.archetype === 'executive_actions') {
      actionLeakageCount++
    }
  }

  const accuracy = correct / holdout.length
  assert.ok(accuracy >= 0.95, `Expected >= 95% accuracy on gold benchmark, got ${(accuracy * 100).toFixed(2)}%`)
  assert.equal(actionLeakageCount, 0, 'Zero leakage violation: logistics item classified as executive action!')
})
```

#### Test 5: Cross-Mailbox Deduplication & Thread Resolution
```javascript
test('correctly deduplicates identical RFC Message-IDs and identical fallback content across mailboxes', async () => {
  const email1 = {
    messageId: '<order-amazon-9923841@amazon.com>',
    from: 'Amazon.com <auto-confirm@amazon.com>',
    subject: 'Your order has shipped',
    receivedAt: '2026-08-15T10:00:00Z',
    normalizedBody: 'Tracking number 1Z9999999999999999',
    mailboxOwner: 'michael',
  }
  const email2 = {
    ...email1,
    mailboxOwner: 'rachel', // mom also received copy
  }

  const key1 = await canonicalEmailKey(email1)
  const key2 = await canonicalEmailKey(email2)
  assert.equal(key1, key2)
  assert.equal(key1, 'rfc:order-amazon-9923841@amazon.com')

  const deduplicated = deduplicateEmailCorpus([email1, email2])
  assert.equal(deduplicated.length, 1)
  assert.deepEqual(deduplicated[0].mailboxes.sort(), ['michael', 'rachel'])
})
```

#### Test 6: Edge Case & Adversarial Robustness
```javascript
test('robustly handles edge cases: unicode diacritics, emojis, empty body, malformed headers, nested threads', () => {
  const edgeCases = [
    {
      subject: '📦 Your package is arriving today! 🎉',
      bodyText: 'Renée, your café order #9928 is out for delivery with UPS.',
      expectedArchetype: 'logistics_parcels',
    },
    {
      subject: 'Dental appointment for Emme: 🪥 Tuesday 3:00 PM',
      bodyText: '', // empty body
      expectedArchetype: 'temporal_appointments',
    },
    {
      subject: '', // empty subject
      bodyText: 'Your Florida Power & Light bill of $245.12 is due on Sept 1. Pay at fpl.com/pay',
      expectedArchetype: 'executive_actions',
    },
    {
      subject: 'Fwd: Required Field Trip Permission Slip',
      bodyText: '---------- Forwarded message ---------\nFrom: principal@palmbeachschools.org\nPlease sign and return by Friday.',
      expectedArchetype: 'executive_actions',
    },
  ]

  for (const testCase of edgeCases) {
    const result = classifyEmail(testCase)
    assert.equal(result.archetype, testCase.expectedArchetype)
  }
})
```

#### Test 7: Throughput & Performance Gate (<1,500ms for 1,000 emails)
```javascript
test('processes and clusters 1,000 emails in < 1,500ms (throughput gate)', () => {
  const corpus = generateSyntheticCorpus({ count: 1000, seed: 12345 })
  const start = performance.now()
  
  for (const email of corpus) {
    const redacted = redactEmailPII(email.bodyText)
    const entities = extractEmailEntities(redacted, email.from)
    const classification = classifyEmail({ ...email, bodyText: redacted })
    assert.ok(classification.archetype)
  }

  const durationMs = performance.now() - start
  assert.ok(durationMs < 1500, `Expected < 1500ms for 1,000 emails, took ${durationMs.toFixed(1)}ms`)
})
```

---

## 4. Implementation Blueprint for Worker (Phase 2)

To enable seamless implementation by the Phase 2 Worker, the following file boundaries and export signatures are specified:

### 4.1. File Layout
1. `supabase/functions/_shared/email-clusterer.mjs` (or `lib/email-clustering.ts`):
   - `classifyEmail(emailInput)`: Returns `{ archetype, confidence, subCategory, agencyLevel }`
   - `redactEmailPII(text)`: Redacts personal identifiers, phones, SSNs, credit cards, addresses, emails, and account numbers.
   - `extractEmailEntities(text, from)`: Extracts order IDs, tracking numbers, couriers, appointment dates, due dates, amounts.
   - `deduplicateEmailCorpus(emails)`: Merges multi-mailbox duplicate messages.
2. `scripts/harvest-historical-email-corpus.mjs`:
   - `generateSyntheticCorpus({ count, seed, injectKnownPii, isGoldBenchmark })`: Deterministic 1,000+ synthetic email generator.
   - CLI execution (`node scripts/harvest-historical-email-corpus.mjs --synthetic --output=tests/fixtures/email-corpus-1000.json`).
3. `tests/email-harvester-clusterer.test.mjs`:
   - Complete 7-scenario automated test suite.

---

## 5. Verification & Validation Checklist

- [x] Structure and distribution of 1,000+ emails across all Gmail categories and 32 senders documented.
- [x] 8-class Edge Case taxonomy defined with concrete synthetic injection patterns.
- [x] Test suite design specified with 7 rigorous automated test scenarios.
- [x] 100% PII redaction verification methodology designed with known synthetic seed tokens.
- [x] Zero unclassified / fallback failure requirement specified across all 6 archetypes.
- [x] 0% leakage constraint into Executive Action Queue documented.
- [x] Throughput and performance budget (<1,500ms for 1,000 emails) established.
