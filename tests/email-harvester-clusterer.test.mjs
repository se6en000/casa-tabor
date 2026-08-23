// tests/email-harvester-clusterer.test.mjs
// Comprehensive Test Suite for Historical Corpus Harvester & Semantic Clusterer
// Validates 1,000+ Corpus Generation, 100% PII Redaction, 0% Promo Leakage, Utility Precedence, and Deduplication

import test from 'node:test'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'

import {
  generateSyntheticCorpus,
  generateSyntheticEmail,
  KNOWN_PII_SEEDS,
  harvestCorpus,
} from '../scripts/harvest-historical-email-corpus.mjs'

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
} from '../supabase/functions/_shared/email-clusterer.mjs'

import {
  canonicalEmailKey,
  normalizeInternetMessageId,
} from '../supabase/functions/_shared/gmail-canonical-email.mjs'

// ============================================================================
// 1. CORPUS GENERATION & SCALE GATE
// ============================================================================

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
  assert.ok(personal >= 200, `Expected >= 200 Personal, got ${personal}`)
  assert.ok(updates >= 300, `Expected >= 300 Updates, got ${updates}`)
  assert.ok(promo >= 100, `Expected >= 100 Promotions, got ${promo}`)

  // Sender diversity
  const uniqueDomains = new Set(corpus.map(m => m.from.match(/@([a-z0-9.-]+)/i)?.[1]))
  assert.ok(uniqueDomains.size >= 25, `Expected >= 25 unique sender domains, got ${uniqueDomains.size}`)
})

// ============================================================================
// 2. 100% PII REDACTION & DEEP MATRIX VERIFICATION
// ============================================================================

test('achieves 100% PII redaction on sensitive synthetic seeds and test vectors', () => {
  const sensitiveCorpus = generateSyntheticCorpus({ count: 200, seed: 99, injectKnownPii: true })
  let checkedPiiCount = 0

  for (const email of sensitiveCorpus) {
    const piiSeeds = email.groundTruth?.expectedEntities?.piiTokens ?? []
    if (piiSeeds.length === 0) continue

    const redactedText = redactEmailPII(email.bodyText)
    const redactedSubject = redactEmailPII(email.subject)
    const combinedRedacted = `${redactedSubject}\n${redactedText}`

    for (const piiToken of piiSeeds) {
      if (!piiToken) continue
      checkedPiiCount++
      assert.ok(
        !combinedRedacted.includes(piiToken),
        `PII leak detected! Found "${piiToken}" in redacted output for email ${email.id}`,
      )
    }
  }

  assert.ok(checkedPiiCount >= 500, `Expected >= 500 checked PII tokens, got ${checkedPiiCount}`)
})

test('redacts all 35 deep matrix obfuscated and international PII formats with 0 leaks', () => {
  const piiVectors = [
    // SSN Formats
    { category: 'SSN', format: 'Standard hyphen', input: '123-45-6789' },
    { category: 'SSN', format: 'Spaced format', input: '123 45 6789' },
    { category: 'SSN', format: 'Dot separated', input: '123.45.6789' },
    { category: 'SSN', format: 'Underscore separated', input: '123_45_6789' },
    { category: 'SSN', format: 'Unformatted 9-digit with label', input: 'SSN: 123456789' },

    // Credit Card Formats
    { category: 'Credit Card', format: 'Visa 16-digit spaced', input: '4000 1234 5678 9010' },
    { category: 'Credit Card', format: 'Visa 16-digit dashed', input: '4000-1234-5678-9010' },
    { category: 'Credit Card', format: 'Visa 16-digit unspaced', input: '4000123456789010' },
    { category: 'Credit Card', format: 'Amex 15-digit spaced', input: '3782 822463 10005' },
    { category: 'Credit Card', format: 'Amex 15-digit dashed', input: '3782-822463-10005' },
    { category: 'Credit Card', format: 'Dot-separated 16-digit', input: '4111.2222.3333.4444' },

    // Phone Numbers
    { category: 'Phone', format: 'US standard parens', input: '(561) 555-0144' },
    { category: 'Phone', format: 'US standard dashed', input: '561-555-0199' },
    { category: 'Phone', format: 'US dot separated', input: '561.555.0198' },
    { category: 'Phone', format: 'US with +1', input: '+1-561-555-0144' },
    { category: 'Phone', format: 'US +1 with parens', input: '+1 (561) 555-0199' },
    { category: 'Phone', format: 'US 10-digit raw', input: '5615550199' },
    { category: 'Phone', format: 'UK International', input: '+44 20 7946 0919' },
    { category: 'Phone', format: 'France International', input: '+33 1 42 68 55 00' },
    { category: 'Phone', format: 'Japan International', input: '+81 3 1234 5678' },

    // Physical Addresses
    { category: 'Address', format: 'Standard street with Apt', input: '123 Ocean Boulevard, Apt 4B, Palm Beach, FL 33480' },
    { category: 'Address', format: 'Blvd with Suite', input: '4520 PGA Blvd, Suite 200, Palm Beach Gardens, FL 33418' },
    { category: 'Address', format: 'Way suffix', input: '789 Mirasol Way, Palm Beach Gardens, FL 33418' },
    { category: 'Address', format: 'Directional Ave', input: '500 S Australian Ave, West Palm Beach, FL 33401' },
    { category: 'Address', format: 'Trail suffix', input: '1000 North Military Trail, Jupiter, FL 33458' },
    { category: 'Address', format: 'PO Box format', input: 'PO Box 4920, Palm Beach, FL 33480' },
    { category: 'Address', format: 'Short PO Box', input: 'P.O. Box 123' },

    // Emails
    { category: 'Email', format: 'Personal Gmail', input: 'sarah.tabor@gmail.com' },
    { category: 'Email', format: 'Gmail with plus-tag', input: 'sarah.tabor+school@gmail.com' },
    { category: 'Email', format: 'Custom domain email', input: 'michael@taborfamily.net' },

    // Credentials
    { category: 'Credentials', format: '4-digit PIN', input: 'PIN: 4829' },
    { category: 'Credentials', format: 'Temporary Password', input: 'Temp Password: Pass#2026!' },
    { category: 'Credentials', format: 'Security Code', input: 'Security Code: 839201' },
    { category: 'Credentials', format: 'OTP', input: 'OTP: 994812' },
  ]

  for (const vec of piiVectors) {
    const raw = `Confidential customer record: ${vec.input}. Please store securely.`
    const redacted = redactEmailPII(raw)
    assert.ok(
      !redacted.includes(vec.input),
      `PII vector leak: ${vec.category} (${vec.format}) -> input "${vec.input}" remained in "${redacted}"`,
    )
  }
})

test('clusterEmailCorpus sanitizes snippet, to, and from ensuring zero PII in serialized objects', () => {
  const sensitiveEmail = {
    id: 'test_leak_01',
    from: 'Sarah Tabor <sarah.tabor@gmail.com>',
    to: ['Jacob Tabor <jacobrtabor@gmail.com>'],
    subject: 'Important Medical Details for Olivia Tabor',
    snippet: 'Delivering package to Sarah Tabor at 123 Ocean Boulevard, Apt 4B, Palm Beach, FL 33480',
    bodyText: 'Delivering package to Sarah Tabor at 123 Ocean Boulevard, Apt 4B, Palm Beach, FL 33480 with card ending 4111.2222.3333.4444 and phone +44 20 7946 0919.',
  }

  const result = clusterEmailCorpus([sensitiveEmail], { anonymize: true, deduplicate: false })
  const processed = result.processedEmails[0]

  assert.ok(!processed.snippet.includes('Sarah Tabor'), 'Snippet must not contain Sarah Tabor')
  assert.ok(!processed.snippet.includes('123 Ocean Boulevard'), 'Snippet must not contain 123 Ocean Boulevard')
  assert.ok(!processed.to[0].includes('Jacob Tabor'), 'To field must not contain Jacob Tabor')
  assert.ok(!processed.to[0].includes('jacobrtabor@gmail.com'), 'To field must not contain personal email')
  assert.ok(!processed.from.includes('Sarah Tabor'), 'From field must not contain personal name')
  assert.ok(!processed.from.includes('sarah.tabor@gmail.com'), 'From field must not contain personal email')
})

// ============================================================================
// 3. RETAILER PROMOTIONAL ISOLATION VS LOGISTICS
// ============================================================================

test('accurately classifies merchant marketing deals into promotional_noise (0% promo leakage into logistics)', () => {
  const merchantPromos = [
    {
      domain: 'doordash.com',
      from: 'DoorDash Deals <deals@doordash.com>',
      subject: 'Get $0 delivery fees on your next 3 dinner orders with DashPass!',
      bodyText: 'Enjoy unlimited free delivery on orders over $12. Promo code ZERO.',
    },
    {
      domain: 'amazon.com',
      from: 'Amazon Deals <store-news@amazon.com>',
      subject: 'Save 50% on Echo Dot and Fire TV - Prime Exclusive Sale!',
      bodyText: 'Prime members save big this weekend only. Shop now.',
    },
    {
      domain: 'walmart.com',
      from: 'Walmart <savings@walmart.com>',
      subject: 'Rollbacks on electronics: Up to 40% off this weekend only',
      bodyText: 'Save up to 40% on 4K TVs and laptops. Shop rollbacks now.',
    },
    {
      domain: 'chewy.com',
      from: 'Chewy <promotions@chewy.com>',
      subject: 'Save $20 on your first pet food order + free shipping',
      bodyText: 'Stock up on pet essentials with coupon code PET20.',
    },
    {
      domain: 'instacart.com',
      from: 'Instacart <offers@instacart.com>',
      subject: 'Save $15 on your grocery order of $50 or more!',
      bodyText: 'Use promo code FRESH15 at checkout for $15 off your groceries.',
    },
    {
      domain: 'hellofresh.com',
      from: 'HelloFresh <hello@hellofresh.com>',
      subject: 'Claim 16 Free Meals + 3 Surprise Gifts when you reactivate!',
      bodyText: 'Reactivate your subscription today to get 16 free meals.',
    },
  ]

  for (const promo of merchantPromos) {
    const classification = classifyEmail(promo)
    assert.equal(
      classification.archetype,
      'promotional_noise',
      `Merchant promo from ${promo.domain} was misclassified as ${classification.archetype} instead of promotional_noise`,
    )
    assert.equal(classification.agencyLevel, 0)
    assert.ok(classification.confidence >= 0.95)
  }
})

test('accurately classifies true merchant transactional orders into logistics_parcels', () => {
  const merchantTransactions = [
    {
      from: 'Amazon.com <auto-confirm@amazon.com>',
      subject: 'Your Amazon.com order #114-8291048-2849102 has shipped',
      bodyText: 'Your package containing 2 items has shipped with UPS 1Z9999999999999999.',
    },
    {
      from: 'Walmart Orders <help@walmart.com>',
      subject: 'Walmart InHome: Your groceries have been delivered! (Order #2000154-80824348)',
      bodyText: 'Your InHome driver has placed your groceries in the kitchen.',
    },
    {
      from: 'HelloFresh <delivery@hellofresh.com>',
      subject: 'Your weekly meal kit order #HF-9928172 is on its way!',
      bodyText: 'Your box is out for delivery via FedEx tracking 9400111899562537620192.',
    },
  ]

  for (const tx of merchantTransactions) {
    const classification = classifyEmail(tx)
    assert.equal(classification.archetype, 'logistics_parcels')
    assert.equal(classification.agencyLevel, 0)
  }
})

// ============================================================================
// 4. UTILITY BILLING VS OUTAGE PRECEDENCE
// ============================================================================

test('prioritizes utility past-due billing notices over outage disruption warnings', () => {
  const billWithDisruptionNotice = {
    from: 'Florida Power & Light <ebill@fpl.com>',
    subject: 'Your FPL Electric Statement is Ready - Amount Due: $218.45',
    bodyText: 'Your electric bill is past due. Amount due: $218.45. Pay now at https://fpl.com/pay to avoid disruption of service.',
  }

  const result = classifyEmail(billWithDisruptionNotice)
  assert.equal(
    result.archetype,
    'executive_actions',
    `Expected executive_actions for past due bill, got ${result.archetype}`,
  )
  assert.equal(result.subCategory, 'bill_invoice_due')
  assert.ok(result.agencyLevel >= 2, `Expected agencyLevel >= 2 for past due bill, got ${result.agencyLevel}`)
})

test('correctly routes true utility outages to lifecycle_updates with agencyLevel 0', () => {
  const outageNotice = {
    from: 'Florida Power & Light <outages@fpl.com>',
    subject: 'FPL Alert: Power outage reported in your neighborhood',
    bodyText: 'A power outage has been detected on your grid circuit. Crews are assigned. Estimated restoration: 4:30 PM.',
  }

  const result = classifyEmail(outageNotice)
  assert.equal(result.archetype, 'lifecycle_updates')
  assert.equal(result.subCategory, 'utility_service_outage')
  assert.equal(result.agencyLevel, 0)
})

// ============================================================================
// 5. 100% ARCHETYPE COVERAGE & ACCURACY GATES
// ============================================================================

test('accurately classifies 1,000+ emails across all 6 archetypes with 0 unclassified failures', () => {
  const corpus = generateSyntheticCorpus({ count: 1100, seed: 42 })
  const counts = {}
  for (const arch of SEMANTIC_ARCHETYPES) counts[arch] = 0

  for (const email of corpus) {
    const result = classifyEmail(email)
    assert.ok(SEMANTIC_ARCHETYPES.includes(result.archetype), `Invalid archetype: ${result.archetype}`)
    assert.ok(result.confidence >= 0.5 && result.confidence <= 1.0, `Invalid confidence: ${result.confidence}`)
    counts[result.archetype]++
  }

  for (const [arch, count] of Object.entries(counts)) {
    assert.ok(count >= 80, `Archetype ${arch} underrepresented: only ${count} instances`)
  }
})

test('achieves >= 98% classification accuracy on benchmark labeled holdout dataset with 0% action leakage', () => {
  const holdout = generateSyntheticCorpus({ count: 300, seed: 777, isGoldBenchmark: true })
  let correct = 0
  let actionLeakageCount = 0

  for (const item of holdout) {
    const result = classifyEmail(item)
    const expected = item.groundTruth.archetype
    if (result.archetype === expected) {
      correct++
    }

    // 0% false leakage check: logistics or promo items must never leak into executive_actions
    if ((expected === 'logistics_parcels' || expected === 'promotional_noise') && result.archetype === 'executive_actions') {
      actionLeakageCount++
    }
  }

  const accuracy = correct / holdout.length
  assert.ok(
    accuracy >= 0.98,
    `Expected >= 98% accuracy on benchmark holdout, got ${(accuracy * 100).toFixed(2)}% (${correct}/${holdout.length})`,
  )
  assert.equal(actionLeakageCount, 0, 'Zero leakage violation: passive item classified as executive action!')
})

// ============================================================================
// 6. CROSS-MAILBOX DEDUPLICATION & THREAD RESOLUTION
// ============================================================================

test('correctly deduplicates identical RFC Message-IDs and identical fallback content across mailboxes', async () => {
  const email1 = {
    messageId: '<order-amazon-9923841@amazon.com>',
    from: 'Amazon.com <auto-confirm@amazon.com>',
    subject: 'Your order has shipped',
    receivedAt: '2026-08-15T10:00:00Z',
    bodyText: 'Tracking number 1Z9999999999999999',
    mailboxOwner: 'michael',
  }
  const email2 = {
    ...email1,
    mailboxOwner: 'rachel',
  }

  const key1 = await canonicalEmailKey({
    messageId: email1.messageId,
    from: email1.from,
    subject: email1.subject,
    receivedAt: email1.receivedAt,
    normalizedBody: email1.bodyText,
  })
  const key2 = await canonicalEmailKey({
    messageId: email2.messageId,
    from: email2.from,
    subject: email2.subject,
    receivedAt: email2.receivedAt,
    normalizedBody: email2.bodyText,
  })

  assert.equal(key1, key2)
  assert.equal(key1, 'rfc:order-amazon-9923841@amazon.com')

  const deduplicated = deduplicateEmailCorpus([email1, email2])
  assert.equal(deduplicated.length, 1)
  assert.deepEqual(deduplicated[0].mailboxes.sort(), ['michael', 'rachel'])
  assert.equal(deduplicated[0].duplicateCount, 2)
})

test('deduplicates fallback content hash when Message-ID is missing', () => {
  const email1 = {
    from: 'Principal Davis <principal@palmbeachschools.org>',
    subject: 'Emergency Contact Form Reminder',
    receivedAt: '2026-08-20T14:00:00Z',
    bodyText: 'Please submit emergency forms for all students.',
    mailboxOwner: 'jacob',
  }
  const email2 = {
    ...email1,
    mailboxOwner: 'kelly',
  }

  const deduplicated = deduplicateEmailCorpus([email1, email2])
  assert.equal(deduplicated.length, 1)
  assert.equal(deduplicated[0].duplicateCount, 2)
  assert.deepEqual(deduplicated[0].mailboxes.sort(), ['jacob', 'kelly'])
})

// ============================================================================
// 7. EDGE CASES & ADVERSARIAL ROBUSTNESS
// ============================================================================

test('Edge Case 1: Unicode diacritics, accents, and non-Latin scripts', () => {
  const testCases = [
    {
      from: 'Café Direct <orders@cafedirect.com>',
      subject: '📦 Votre commande pour Renée Tabor est en route! 🎉',
      bodyText: 'Bonjour Renée, votre paquet de Café Bustelo a été expédié avec UPS 1Z9928371928371928.',
      expectedArchetype: 'logistics_parcels',
    },
    {
      from: 'Delta Air Lines <ticketreceipt@delta.com>',
      subject: 'Delta Flight Confirmation: 東京/成田 (NRT) -> Miami (MIA) #DL882',
      bodyText: 'Passenger: François Müller. Confirmation code: NRT882. Departure at 14:30.',
      expectedArchetype: 'temporal_appointments',
    },
  ]

  for (const tc of testCases) {
    const result = classifyEmail(tc)
    assert.equal(result.archetype, tc.expectedArchetype)
  }
})

test('Edge Case 2: Multi-hop nested forwarded threads unwrapping', () => {
  const email = {
    from: 'Jacob Tabor <jacobrtabor@gmail.com>',
    subject: 'Fwd: Fwd: Re: Required Field Trip Permission Slip',
    bodyText: `
      FYI please see the forward chain below!
      
      ---------- Forwarded message ---------
      From: Kelly Tabor <kellyroseloucks@gmail.com>
      Date: Thu, Aug 20, 2026 at 10:00 AM
      Subject: Fwd: Required Field Trip Permission Slip
      
      ---------- Forwarded message ---------
      From: Principal Davis <principal@palmbeachschools.org>
      Date: Thu, Aug 20, 2026 at 9:00 AM
      Subject: Required Emergency Contact Form & Field Trip Slip
      To: Parents <parents@palmbeachschools.org>
      
      Parents, please complete, sign and return the attached permission slip by Friday.
    `,
  }
  const result = classifyEmail(email)
  assert.equal(result.archetype, 'executive_actions')
  assert.equal(result.agencyLevel, 2)
})

test('Edge Case 3: Empty body with descriptive subject', () => {
  const email = {
    from: 'Principal Davis <principal@palmbeachschools.org>',
    subject: '⚠️ ACTION REQUIRED: Sign field trip permission slip',
    bodyText: '',
  }
  const result = classifyEmail(email)
  assert.equal(result.archetype, 'executive_actions')
  assert.equal(result.agencyLevel, 2)
})

test('Edge Case 4: Long emails (100KB+ body) process in linear time', () => {
  let longBody = 'Itemized parts receipt:\n'
  for (let i = 0; i < 2000; i++) {
    longBody += `Part #${i}: Micro-controller component ref #9928-${i} with serial SN-8829104829184 and price $12.50.\n`
  }
  longBody += '\nYour order has shipped via UPS tracking 1Z9999999999999999. Estimated delivery Thursday.'

  assert.ok(longBody.length > 100000, `Expected body > 100KB, got ${longBody.length} bytes`)

  const start = performance.now()
  const redacted = redactEmailPII(longBody)
  const classification = classifyEmail({
    from: 'Amazon.com <auto-confirm@amazon.com>',
    subject: 'Your large bulk order has shipped',
    bodyText: redacted,
  })
  const durationMs = performance.now() - start

  assert.equal(classification.archetype, 'logistics_parcels')
  assert.ok(durationMs < 50, `100KB email processing took too long: ${durationMs.toFixed(1)}ms`)
})

// ============================================================================
// 8. ENTITY EXTRACTION & CANONICAL ORDER IDS
// ============================================================================

test('extracts canonical order numbers, tracking numbers, carriers, amounts, and dates', () => {
  const emailText = `
    Thank you for shopping at Walmart!
    Order Number: 2000154-80824348
    Your order total is $142.85 (Amount due: $0.00).
    Shipped with FedEx tracking 9400111899562537620192 and UPS 1Z9999999999999999.
    Expected delivery: Sept 12th.
  `

  const entities = extractEmailEntities(emailText, 'Walmart <help@walmart.com>', 'Your Walmart Order')

  assert.equal(entities.merchantName, 'Walmart')
  assert.equal(entities.orderId, '2000154-80824348')
  assert.equal(entities.canonicalOrderId, '2000154-80824348')
  assert.ok(entities.trackingNumbers.some(t => t.carrier === 'ups' && t.trackingNumber === '1Z9999999999999999'))
  assert.ok(entities.monetaryAmounts.some(m => m.amount === 142.85))
})

test('canonicalizes order IDs across Walmart, Amazon, Apple, Nike, HelloFresh', () => {
  // Amazon 3-7-7
  assert.equal(canonicalizeOrderId('Amazon', '11482910482849102'), '114-8291048-2849102')
  assert.equal(canonicalizeOrderId('Amazon', '114-8291048-2849102'), '114-8291048-2849102')

  // Walmart 7-8
  assert.equal(canonicalizeOrderId('Walmart', '200015480824348'), '2000154-80824348')
  assert.equal(canonicalizeOrderId('Walmart', '2000154-80824348'), '2000154-80824348')

  // Apple W-prefix
  assert.equal(canonicalizeOrderId('Apple', 'w123456789'), 'W123456789')

  // Nike C0-prefix
  assert.equal(canonicalizeOrderId('Nike', 'c0123456789'), 'C0123456789')

  // HelloFresh
  assert.equal(canonicalizeOrderId('HelloFresh', 'hf-9928341'), 'HF-9928341')
})

test('validates Luhn algorithm for credit card detection', () => {
  assert.equal(isValidLuhn('4111222233334444'), false)
  assert.equal(isValidLuhn('49927398716'), true)
  assert.equal(isValidLuhn('123'), false)
})

// ============================================================================
// 9. HIGH-SPEED CLUSTERING PIPELINE & SCALE GATE
// ============================================================================

test('processes and clusters 1,000 emails in < 1,500ms (throughput gate)', () => {
  const corpus = generateSyntheticCorpus({ count: 1000, seed: 12345 })
  const start = performance.now()

  const result = clusterEmailCorpus(corpus, { anonymize: true, deduplicate: true })

  const durationMs = performance.now() - start
  assert.equal(result.processedEmails.length, 1000)
  assert.ok(
    durationMs < 1500,
    `Expected < 1500ms for 1,000 emails, took ${durationMs.toFixed(1)}ms (${(1000 / (durationMs / 1000)).toFixed(0)} emails/sec)`,
  )
})
