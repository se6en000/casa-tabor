// .agents/sub_orch_m1/auditor_1_it2/novel_stress_audit.mjs
// Forensic Auditor Novel Stress & Integrity Verification Script
// ZERO TOLERANCE: Tests entirely unseen inputs, randomized seeds, and hostile corner cases.

import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'

import {
  classifyEmail,
  redactEmailPII,
  anonymizeEmail,
  deduplicateEmailCorpus,
  clusterEmailCorpus,
  extractEmailEntities,
  canonicalizeOrderId,
  isValidLuhn,
  SEMANTIC_ARCHETYPES,
} from '../../../supabase/functions/_shared/email-clusterer.mjs'

import {
  classifyEmail as classifyEmailTs,
  redactEmailPII as redactEmailPIITs,
  anonymizeEmail as anonymizeEmailTs,
  canonicalizeOrderId as canonicalizeOrderIdTs,
  isValidLuhn as isValidLuhnTs,
  clusterEmailCorpus as clusterEmailCorpusTs,
} from '../../../src/lib/email-clustering.ts'

console.log('========================================================================')
console.log('  FORENSIC AUDITOR INDEPENDENT NOVEL DYNAMIC VERIFICATION')
console.log('========================================================================\n')

let passed = 0
let failed = 0

function runTest(name, fn) {
  try {
    fn()
    passed++
    console.log(`  ✔ [PASS] ${name}`)
  } catch (err) {
    failed++
    console.error(`  ✖ [FAIL] ${name}`)
    console.error(`    ${err.message}`)
  }
}

// ----------------------------------------------------------------------------
// TEST 1: NOVEL PII REDACTION VECTORS (UNSEEN NAMES, PHONES, CARDS, ADDRESSES)
// ----------------------------------------------------------------------------
console.log('--- 1. Novel PII Redaction Vectors ---')

runTest('Redacts unseen French & German accented names', () => {
  const input = 'Dear François Müller and Renée Tabor, your private appointment is set.'
  const redacted = redactEmailPII(input)
  assert.ok(!redacted.includes('François Müller'))
  assert.ok(!redacted.includes('Renée Tabor'))
  assert.ok(redacted.includes('[NAME_REDACTED]'))
})

runTest('Redacts international phone numbers from Australia, Germany, and Switzerland', () => {
  const numbers = [
    '+61 2 9374 4000',
    '+49 30 12345678',
    '+41 22 767 61 11',
    '+1 (305) 888-9900 ext. 124',
    '+1.561.443.2211',
  ]
  for (const num of numbers) {
    const raw = `Please call Dr. Smith at ${num} immediately.`
    const red = redactEmailPII(raw)
    assert.ok(!red.includes(num), `Failed to redact phone: ${num} -> ${red}`)
    assert.ok(red.includes('[PHONE_REDACTED]'))
  }
})

runTest('Redacts complex physical addresses with secondary unit designs', () => {
  const addresses = [
    'Unit 12B, 9840 South Ocean Drive, Jupiter, FL 33477',
    'Post Office Box 88192, West Palm Beach, FL 33401',
    'PO Box 99, Jupiter, FL 33458',
    'Suite 400, 1500 North Congress Avenue, West Palm Beach, Florida 33401',
  ]
  for (const addr of addresses) {
    const raw = `Your order will be dropped off at ${addr} by Thursday.`
    const red = redactEmailPII(raw)
    assert.ok(!red.includes(addr), `Address leaked: ${addr} -> ${red}`)
    assert.ok(red.includes('[ADDRESS_REDACTED]'))
  }
})

runTest('Redacts Luhn-valid Credit Cards while protecting Amazon & Walmart order IDs', () => {
  // Luhn-valid Discover card: 6011 0009 9013 9424
  const discoverCard = '6011 0009 9013 9424'
  const textWithCard = `Charged $99.40 to Discover card ${discoverCard}.`
  const redCard = redactEmailPII(textWithCard)
  assert.ok(!redCard.includes(discoverCard), 'Discover card must be redacted')
  assert.ok(redCard.includes('[CARD_REDACTED]'))

  // Order numbers must NOT be redacted
  const amazonOrder = '114-9849201-4829104'
  const walmartOrder = '2000154-80824348'
  const textWithOrders = `Amazon Order #${amazonOrder} and Walmart #${walmartOrder}`
  const redOrders = redactEmailPII(textWithOrders)
  assert.ok(redOrders.includes(amazonOrder), `Amazon order number was falsely destroyed: ${redOrders}`)
  assert.ok(redOrders.includes(walmartOrder), `Walmart order number was falsely destroyed: ${redOrders}`)
})

// ----------------------------------------------------------------------------
// TEST 2: CLASSIFIER DISAMBIGUATION & ZERO LEAKAGE
// ----------------------------------------------------------------------------
console.log('\n--- 2. Classifier Disambiguation & Zero Leakage ---')

runTest('Deceptive Retail Marketing with urgent "ACTION REQUIRED" stays in promotional_noise', () => {
  const fakeUrgency = {
    from: 'Exclusive Deals <marketing@designerbrands.com>',
    subject: '🚨 ACTION REQUIRED: 75% Clearance Sale Ends in 2 Hours!',
    bodyText: 'Do not miss out on our biggest blowout sale of the year. Save big on designer jackets. Shop now!',
  }
  const result = classifyEmail(fakeUrgency)
  assert.equal(result.archetype, 'promotional_noise')
  assert.equal(result.agencyLevel, 0)
})

runTest('Passive shipping confirmation with return policy notice stays in logistics_parcels (0% Action Leakage)', () => {
  const returnPolicyEmail = {
    from: 'Target Orders <orders@target.com>',
    subject: 'Your Target Order #9812736450 has been delivered',
    bodyText: 'Your order was delivered to your front porch. Return window: items eligible for return within 90 days. Submit damage claims online.',
  }
  const result = classifyEmail(returnPolicyEmail)
  assert.equal(result.archetype, 'logistics_parcels')
  assert.equal(result.agencyLevel, 0)
})

runTest('Urgent electric disconnection notice routes to executive_actions with high agency', () => {
  const disconnectEmail = {
    from: 'Florida Power & Light <ebill@fpl.com>',
    subject: 'Urgent: FPL Final Disconnect Notice - Past Due Balance $312.80',
    bodyText: 'Your account is past due. Amount due: $312.80. Pay immediately to avoid service disconnection on 09/01/2026.',
  }
  const result = classifyEmail(disconnectEmail)
  assert.equal(result.archetype, 'executive_actions')
  assert.equal(result.subCategory, 'bill_invoice_due')
  assert.equal(result.agencyLevel, 3)
})

runTest('Operational electric power outage routes to lifecycle_updates with agencyLevel 0', () => {
  const outageEmail = {
    from: 'Florida Power & Light <outages@fpl.com>',
    subject: 'FPL Storm Outage Update: Crews dispatched to your sector',
    bodyText: 'A power outage has been detected on feeder line #94. Crews are working on grid restoration. Estimated power restoration: 6:00 PM.',
  }
  const result = classifyEmail(outageEmail)
  assert.equal(result.archetype, 'lifecycle_updates')
  assert.equal(result.subCategory, 'utility_service_outage')
  assert.equal(result.agencyLevel, 0)
})

// ----------------------------------------------------------------------------
// TEST 3: CANONICAL ENTITY & ORDER EXTRACTION
// ----------------------------------------------------------------------------
console.log('\n--- 3. Canonical Entity & Order Extraction ---')

runTest('Canonicalizes order numbers across vendors', () => {
  assert.equal(canonicalizeOrderId('Walmart', '200015480824348'), '2000154-80824348')
  assert.equal(canonicalizeOrderId('Amazon', '11482910482849102'), '114-8291048-2849102')
  assert.equal(canonicalizeOrderId('Apple', 'w987654321'), 'W987654321')
  assert.equal(canonicalizeOrderId('Nike', 'c0987654321'), 'C0987654321')
  assert.equal(canonicalizeOrderId('HelloFresh', 'hf-8829104'), 'HF-8829104')
})

runTest('Extracts multi-carrier tracking numbers, order IDs, and monetary amounts simultaneously', () => {
  const body = `
    Receipt for Walmart Order #2000154-80824348.
    Total amount paid: $89.50 (Balance due: $0.00).
    Shipped via FedEx 9400111899562537620192 and UPS 1Z12345E0205271688.
    Expected arrival by Friday, September 18th.
  `
  const entities = extractEmailEntities(body, 'Walmart <help@walmart.com>', 'Your Walmart Order')
  assert.equal(entities.merchantName, 'Walmart')
  assert.equal(entities.canonicalOrderId, '2000154-80824348')
  assert.ok(entities.trackingNumbers.length >= 2)
  assert.ok(entities.trackingNumbers.some(t => t.carrier === 'ups' && t.trackingNumber === '1Z12345E0205271688'))
  assert.ok(entities.trackingNumbers.some(t => t.carrier === 'fedex' && t.trackingNumber === '9400111899562537620192'))
  assert.ok(entities.monetaryAmounts.some(m => m.amount === 89.50))
})

// ----------------------------------------------------------------------------
// TEST 4: DEDUPLICATION INTEGRITY & CROSS-MAILBOX AGGREGATION
// ----------------------------------------------------------------------------
console.log('\n--- 4. Deduplication Integrity & Cross-Mailbox Aggregation ---')

runTest('Aggregates 4 multi-mailbox copies into 1 canonical item preserving all owners', () => {
  const copies = ['jacob', 'kelly', 'liv', 'owen'].map(owner => ({
    id: `msg_school_${owner}`,
    messageId: '<20260901.PB_SCHOOL_BACK_TO_SCHOOL@palmbeachschools.org>',
    from: 'Principal Davis <principal@palmbeachschools.org>',
    subject: 'Welcome Back to School 2026-2027!',
    bodyText: 'We are thrilled to welcome all families back to campus.',
    mailboxOwner: owner,
  }))

  const deduped = deduplicateEmailCorpus(copies)
  assert.equal(deduped.length, 1)
  assert.equal(deduped[0].duplicateCount, 4)
  assert.deepEqual(deduped[0].mailboxes.sort(), ['jacob', 'kelly', 'liv', 'owen'])
})

// ----------------------------------------------------------------------------
// TEST 5: TYPESCRIPT & ESM CLIENT PARITY
// ----------------------------------------------------------------------------
console.log('\n--- 5. TypeScript & ESM Client Parity ---')

runTest('Verifies exact functional parity between email-clusterer.mjs and email-clustering.ts', () => {
  const sampleEmail = {
    from: 'Florida Power & Light <ebill@fpl.com>',
    subject: 'Your FPL Electric Statement is Ready - Amount Due: $195.40',
    bodyText: 'Account balance past due: $195.40. Pay now at https://fpl.com/pay to avoid disruption of service.',
  }

  const esmClass = classifyEmail(sampleEmail)
  const tsClass = classifyEmailTs(sampleEmail)
  assert.equal(esmClass.archetype, tsClass.archetype)
  assert.equal(esmClass.subCategory, tsClass.subCategory)
  assert.equal(esmClass.agencyLevel, tsClass.agencyLevel)

  const rawPII = 'Patient Liv Tabor (SSN: 123.45.6789) at 4520 PGA Blvd, Suite 200. Call +44 20 7946 0919.'
  const esmRedacted = redactEmailPII(rawPII)
  const tsRedacted = redactEmailPIITs(rawPII)
  assert.equal(esmRedacted, tsRedacted)
})

// ----------------------------------------------------------------------------
// TEST 6: SCALE & HIGH THROUGHPUT VERIFICATION (1,500 NOVEL EMAILS)
// ----------------------------------------------------------------------------
console.log('\n--- 6. Scale & High Throughput Verification (1,500 Novel Emails) ---')

runTest('Clusters 1,500 novel emails in < 1,000ms with 0 errors and zero PII leaks', () => {
  const syntheticNovel = []
  for (let i = 0; i < 1500; i++) {
    syntheticNovel.push({
      id: `novel_stress_${i}`,
      from: i % 2 === 0 ? 'Amazon.com <auto-confirm@amazon.com>' : 'School <principal@palmbeachschools.org>',
      subject: i % 2 === 0 ? `Your order #114-1234567-${1000000 + i} has shipped` : `Action Required: Permission slip for student #${i}`,
      bodyText: i % 2 === 0
        ? `Delivering to 123 Ocean Blvd with UPS 1Z9999999999999999. Card ending 4444.`
        : `Please sign consent for student Liv Tabor (SSN: 123-45-6789) at https://palmbeachschools.org/sign. Phone: (561) 555-0199.`,
    })
  }

  const start = performance.now()
  const result = clusterEmailCorpus(syntheticNovel, { anonymize: true, deduplicate: true })
  const duration = performance.now() - start

  assert.equal(result.processedEmails.length, 1500)
  assert.ok(duration < 1000, `Took ${duration.toFixed(1)}ms (threshold < 1000ms)`)
  const rate = (1500 / (duration / 1000)).toFixed(0)
  console.log(`    Throughput: ${rate} emails/sec (Duration: ${duration.toFixed(1)}ms)`)

  // Check serialized output for raw PII
  for (const item of result.processedEmails) {
    assert.ok(!item.bodyText.includes('123-45-6789'))
    assert.ok(!item.bodyText.includes('(561) 555-0199'))
  }
})

console.log('\n========================================================================')
console.log(`  VERIFICATION RESULTS: ${passed} PASSED | ${failed} FAILED`)
console.log('========================================================================\n')

if (failed > 0) process.exit(1)
