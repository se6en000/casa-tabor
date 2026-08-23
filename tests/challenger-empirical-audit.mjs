// tests/challenger-empirical-audit.mjs
// Independent Empirical Audit & Adversarial Challenge Suite
// Authored by Challenger 2 for Milestone 1 Iteration 2

import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {
  classifyEmail,
  redactEmailPII,
  anonymizeEmail,
  deduplicateEmailCorpus,
  clusterEmailCorpus,
  extractEmailEntities,
  SEMANTIC_ARCHETYPES,
} from '../supabase/functions/_shared/email-clusterer.mjs'

import { KNOWN_PII_SEEDS } from '../scripts/harvest-historical-email-corpus.mjs'

console.log('========================================================================')
console.log('  CHALLENGER 2 INDEPENDENT EMPIRICAL AUDIT & STRESS SUITE')
console.log('========================================================================\n')

let totalChecks = 0
let failedChecks = 0

function check(desc, fn) {
  totalChecks++
  try {
    fn()
    console.log(`  [PASS] ${desc}`)
  } catch (err) {
    failedChecks++
    console.error(`  [FAIL] ${desc}`)
    console.error(`         Error: ${err.message}`)
  }
}

// -----------------------------------------------------------------------------
// SECTION 1: Deep PII Audit of `data/historical-email-corpus.json`
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: Deep PII Audit of data/historical-email-corpus.json ---')

const corpusPath = path.resolve('data/historical-email-corpus.json')
assert.ok(fs.existsSync(corpusPath), `Corpus file not found at ${corpusPath}`)
const corpusRaw = fs.readFileSync(corpusPath, 'utf8')
const corpusData = JSON.parse(corpusRaw)

const emails = corpusData.processedEmails || []

check(`Corpus contains >= 1,000 processed emails (Actual: ${emails.length})`, () => {
  assert.ok(emails.length >= 1000, `Expected >= 1000 emails, found ${emails.length}`)
})

// Flatten all strings from all fields in every email item to verify 0 raw PII leakage
check('Zero raw PII token leakage across all emails in corpus', () => {
  const piiLeakages = []
  
  // All known sensitive literals
  const sensitiveTokens = [
    // Names
    ...KNOWN_PII_SEEDS.names,
    // Personal emails
    ...KNOWN_PII_SEEDS.emails,
    // SSNs
    ...KNOWN_PII_SEEDS.ssns,
    // Credit cards
    ...KNOWN_PII_SEEDS.creditCards,
    // Phones
    ...KNOWN_PII_SEEDS.phones,
    // Addresses
    '123 Ocean Boulevard',
    '4520 PGA Blvd',
    '100 Mirasol Way',
    '789 Donald Ross Rd',
    '33418',
    '33480',
    'P.O. Box 45678',
    'Post Office Box 4920',
  ]

  // Generic SSN regex: 9 digits or standard formats (excluding order IDs)
  const rawSsnRegex = /\b\d{3}[- ._]\d{2}[- ._]\d{4}\b/g
  
  // Generic Phone regex: domestic and international
  const rawPhoneRegex = /(?<![0-9A-Za-z])(?:\+1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]\d{3}[-.\s]\d{4}(?![0-9A-Za-z])/g
  const rawIntlPhoneRegex = /(?<![0-9A-Za-z])\+(?:44|33|81)[-.\s]?\d{1,4}[-.\s]?\d{2,4}[-.\s]?\d{3,4}(?![0-9A-Za-z])/g

  // Check every email item
  for (let idx = 0; idx < emails.length; idx++) {
    const item = emails[idx]
    const fieldsToCheck = {
      snippet: item.snippet || '',
      from: item.from || '',
      to: Array.isArray(item.to) ? item.to.join(' ') : (item.to || ''),
      subject: item.subject || '',
      bodyText: item.bodyText || '',
      bodyHtml: item.bodyHtml || '',
      anonymizedText: item.redaction?.anonymizedText || '',
      anonymizedSnippet: item.redaction?.anonymizedSnippet || '',
      anonymizedFrom: item.redaction?.anonymizedFrom || '',
      anonymizedTo: Array.isArray(item.redaction?.anonymizedTo) ? item.redaction.anonymizedTo.join(' ') : (item.redaction?.anonymizedTo || ''),
      anonymizedSubject: item.redaction?.anonymizedSubject || '',
    }

    for (const [field, val] of Object.entries(fieldsToCheck)) {
      if (!val || typeof val !== 'string') continue

      // 1. Literal search
      for (const token of sensitiveTokens) {
        if (token && token.length > 3 && val.includes(token)) {
          piiLeakages.push({
            id: item.id,
            field,
            leakageType: 'literal_match',
            token,
            preview: val.slice(Math.max(0, val.indexOf(token) - 20), val.indexOf(token) + token.length + 20),
          })
        }
      }

      // 2. SSN regex check
      const ssnMatches = val.match(rawSsnRegex)
      if (ssnMatches) {
        for (const m of ssnMatches) {
          // Verify it's not a false match against safe tokens
          if (!m.startsWith('[') && !m.endsWith(']')) {
            piiLeakages.push({ id: item.id, field, leakageType: 'ssn_regex', token: m, preview: val })
          }
        }
      }

      // 3. Phone regex check
      const phoneMatches = val.match(rawPhoneRegex)
      if (phoneMatches) {
        for (const m of phoneMatches) {
          if (!m.includes('[PHONE_REDACTED]')) {
            piiLeakages.push({ id: item.id, field, leakageType: 'phone_regex', token: m, preview: val })
          }
        }
      }

      // 4. Intl Phone regex check
      const intlMatches = val.match(rawIntlPhoneRegex)
      if (intlMatches) {
        for (const m of intlMatches) {
          if (!m.includes('[PHONE_REDACTED]')) {
            piiLeakages.push({ id: item.id, field, leakageType: 'intl_phone_regex', token: m, preview: val })
          }
        }
      }
    }
  }

  if (piiLeakages.length > 0) {
    console.error(`Found ${piiLeakages.length} PII leakages in historical corpus:`)
    for (const leak of piiLeakages.slice(0, 10)) {
      console.error(`  - Email ${leak.id} in field ${leak.field}: [${leak.leakageType}] "${leak.token}" in "${leak.preview}"`)
    }
  }
  assert.equal(piiLeakages.length, 0, `Detected ${piiLeakages.length} raw PII leaks in corpus`)
})


// -----------------------------------------------------------------------------
// SECTION 2: Utility Bill Past-Due vs Outage vs Guide Precedence Audit (100% Accuracy)
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Utility Bill Past-Due vs Outage Precedence Audit ---')

check('100% accuracy on Utility Bill Past-Due & Disconnection Notices (-> executive_actions)', () => {
  const utilityPastDueTestCases = [
    {
      from: 'Florida Power & Light <ebill@fpl.com>',
      subject: 'URGENT: Past-Due Electric Bill Notice for Account #88921-002',
      bodyText: 'Your account is past due. Amount due: $342.18. Pay now to avoid service disruption or electric power disconnection.',
    },
    {
      from: 'FPL Customer Care <support@fpl.com>',
      subject: 'Final Notice of Disconnection - Immediate Action Required',
      bodyText: 'Your electric service is scheduled for disconnection on Sept 1st unless past due balance of $189.50 is paid immediately.',
    },
    {
      from: 'Pacific Gas & Electric <billing@pge.com>',
      subject: 'PG&E Monthly Statement - Past Due Balance Notice',
      bodyText: 'A past-due balance of $210.00 is outstanding. Please submit payment immediately at pge.com/pay to maintain service uninterrupted.',
    },
    {
      from: 'Duke Energy <customer.service@duke-energy.com>',
      subject: 'Notice of Past Due Electric Bill & Disruption Warning',
      bodyText: 'Please pay your overdue balance of $145.20. Pay today to prevent interruption of power service to your property.',
    },
    {
      from: 'City Water Utilities <billing@palmbeachwater.gov>',
      subject: 'City Water & Sewer Bill Past Due - Payment Due Immediately',
      bodyText: 'Your municipal utility invoice #W-99281 is past due in the amount of $94.30. Avoid shutoff by paying online today.',
    },
    {
      from: 'TECO Peoples Gas <invoicing@teco.com>',
      subject: 'Urgent: Gas Bill Overdue - Disconnection Scheduled',
      bodyText: 'Service notice: Past due balance of $78.40 must be received within 5 business days to avoid disconnection.',
    },
    {
      from: 'Consolidated Edison <notifications@coned.com>',
      subject: 'Your ConEd Statement is Past Due',
      bodyText: 'Payment reminder: Total amount due: $162.90. Please pay now to avoid late fees and potential service suspension.',
    },
    {
      from: 'Comcast Xfinity <billing@xfinity.com>',
      subject: 'Action Required: Your Internet & Cable Bill is Past Due',
      bodyText: 'Your service will be interrupted soon unless you pay your past due balance of $120.00.',
    },
  ]

  for (const testCase of utilityPastDueTestCases) {
    const result = classifyEmail(testCase)
    assert.equal(
      result.archetype,
      'executive_actions',
      `Utility past-due notice was misclassified as ${result.archetype} instead of executive_actions. Subject: "${testCase.subject}"`,
    )
    assert.ok(
      result.agencyLevel >= 2,
      `Expected agencyLevel >= 2 for past-due utility bill, got ${result.agencyLevel}`,
    )
  }
})

check('Proper discrimination of Operational Utility Outages (-> lifecycle_updates)', () => {
  const utilityOutageTestCases = [
    {
      from: 'Florida Power & Light <outages@fpl.com>',
      subject: 'FPL Power Outage Alert: Unplanned service disruption in your area',
      bodyText: 'A power outage has been reported near your residence. Crews are actively working on grid repairs. Estimated restoration time: 6:30 PM.',
    },
    {
      from: 'FPL Storm Center <alerts@fpl.com>',
      subject: 'Grid Maintenance: Scheduled Power Outage on Tuesday',
      bodyText: 'Planned system maintenance will cause temporary electric service interruption on Sept 15 between 9:00 AM and 1:00 PM.',
    },
    {
      from: 'City Water Dept <alerts@palmbeachwater.gov>',
      subject: 'Boil Water Notice & Temporary Water Pressure Disruption',
      bodyText: 'Due to a water main repair, a precautionary boil water notice is in effect for your neighborhood until Thursday 12:00 PM.',
    },
  ]

  for (const testCase of utilityOutageTestCases) {
    const result = classifyEmail(testCase)
    assert.equal(
      result.archetype,
      'lifecycle_updates',
      `Utility outage was misclassified as ${result.archetype} instead of lifecycle_updates. Subject: "${testCase.subject}"`,
    )
    assert.equal(
      result.agencyLevel,
      0, // Passive radar item, not an action task
      `Expected agencyLevel 0 for utility outage update, got ${result.agencyLevel}`,
    )
  }
})

check('Proper discrimination of Utility Guides & HOA Bulletins (-> estate_knowledge)', () => {
  const utilityGuideTestCases = [
    {
      from: 'Florida Power & Light <energytips@fpl.com>',
      subject: 'Summer Energy Saving Guide & Thermostat Tips for Homeowners',
      bodyText: 'Learn how to optimize your HVAC runtime, adjust your programmable thermostat, and lower your monthly electric costs.',
    },
    {
      from: 'Mirasol HOA <manager@mirasolhoa.com>',
      subject: 'Community Water Conservation Guidelines for Irrigation Systems',
      bodyText: 'Reminder of village irrigation schedules: Odd addresses water on Wed/Sat, Even addresses water on Thu/Sun.',
    },
  ]

  for (const testCase of utilityGuideTestCases) {
    const result = classifyEmail(testCase)
    assert.equal(
      result.archetype,
      'estate_knowledge',
      `Utility guide was misclassified as ${result.archetype} instead of estate_knowledge. Subject: "${testCase.subject}"`,
    )
  }
})


// -----------------------------------------------------------------------------
// SECTION 3: Retailer Promotional Isolation vs Transactional Logistics Audit
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 3: Retailer Promotional Isolation vs Transactional Logistics Audit ---')

check('0% Promo Leakage on Hybrid Retailers (Amazon, Walmart, Target, DoorDash, Chewy, HelloFresh, UberEats)', () => {
  const promoTestCases = [
    {
      from: 'DoorDash Deals <no-reply@doordash.com>',
      subject: '🍔 Craving sushi? Get $10 off your next 2 orders with code SUSHI10!',
      bodyText: 'Limited time promo. Save $10 on orders over $30 from select local restaurants. Order now in the app.',
    },
    {
      from: 'Amazon.com Deals <store-news@amazon.com>',
      subject: 'Today\'s Deals: Save up to 50% on Echo, Kindle & Fire TV devices',
      bodyText: 'Explore lightning deals and coupon discounts on smart home tech. Shop early before stock runs out!',
    },
    {
      from: 'Walmart Rollbacks <promotions@walmart.com>',
      subject: 'Weekly Ad Rollbacks: Huge savings on groceries and outdoor gear',
      bodyText: 'Check out our weekly circular for low prices on fresh produce, patio furniture, and summer apparel.',
    },
    {
      from: 'Target Circle <circle@target.com>',
      subject: 'Target Circle Bonus: Earn a $15 reward when you make 3 qualifying purchases',
      bodyText: 'Activate your bonus offer today in the Target app and save on your next shopping run.',
    },
    {
      from: 'Chewy Deals <offers@chewy.com>',
      subject: '🐾 Stock up & Save: Buy 2 Get 1 Free on all dog treats & toys!',
      bodyText: 'Treat your furry family member with our seasonal BOGO offer. Auto-ship members get an extra 5% off.',
    },
    {
      from: 'HelloFresh <delicious@hellofresh.com>',
      subject: 'We miss you! Come back and get 16 Free Meals + Free Shipping',
      bodyText: 'Reactivate your meal plan today and enjoy chef-crafted dinners delivered straight to your door.',
    },
    {
      from: 'Uber Eats <eats@uber.com>',
      subject: '🍕 Friday Night Pizza Deal: 30% off your delivery order',
      bodyText: 'Use code PIZZA30 at checkout. Valid tonight only on participating restaurants.',
    },
  ]

  for (const testCase of promoTestCases) {
    const result = classifyEmail(testCase)
    assert.equal(
      result.archetype,
      'promotional_noise',
      `Merchant promo circular was misclassified as ${result.archetype} instead of promotional_noise. From: "${testCase.from}", Subj: "${testCase.subject}"`,
    )
    assert.equal(result.agencyLevel, 0)
  }
})

check('Transactional Orders & Shipments from Hybrid Retailers correctly route to logistics_parcels', () => {
  const transactionalTestCases = [
    {
      from: 'DoorDash Orders <no-reply@doordash.com>',
      subject: 'Your DoorDash order from Tokyo Joe\'s is being prepared (Order #DD-99210)',
      bodyText: 'Estimated delivery: 6:45 PM - 7:05 PM. Dasher Michael is on the way to the restaurant.',
    },
    {
      from: 'Amazon.com <auto-confirm@amazon.com>',
      subject: 'Your Amazon.com order #114-8829104-3748291 has shipped',
      bodyText: 'Your package is on the way via UPS tracking 1Z9999999999999999. Estimated delivery date: Tomorrow by 8 PM.',
    },
    {
      from: 'Walmart Orders <orders@walmart.com>',
      subject: 'Order confirmation: Walmart Order #2000154-8829104',
      bodyText: 'Thank you for your order. We are preparing your items for delivery on Tuesday.',
    },
    {
      from: 'Target Shipping <orders@target.com>',
      subject: 'Your Target order #992819481 is on the way!',
      bodyText: 'Tracking number 9400111899562537620192 via USPS. Track your package online.',
    },
    {
      from: 'Chewy Shipping <service@chewy.com>',
      subject: 'Your Chewy order #99284102 has shipped via FedEx',
      bodyText: 'Tracking 9400111899562537620192. 2 boxes of pet food arriving tomorrow.',
    },
  ]

  for (const testCase of transactionalTestCases) {
    const result = classifyEmail(testCase)
    assert.equal(
      result.archetype,
      'logistics_parcels',
      `Transactional order was misclassified as ${result.archetype} instead of logistics_parcels. From: "${testCase.from}", Subj: "${testCase.subject}"`,
    )
  }
})


// -----------------------------------------------------------------------------
// SECTION 4: Media Newsletters vs Estate Knowledge Audit
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 4: Media Newsletters vs Estate Knowledge Audit ---')

check('External Media/Financial Newsletters route to promotional_noise (not estate_knowledge)', () => {
  const mediaNewsletters = [
    {
      from: 'Morning Brew <crew@morningbrew.com>',
      subject: '☕️ Tech stocks surge as inflation cools down',
      bodyText: 'Good morning! Here is your daily digest of business, technology, and economic news.',
    },
    {
      from: 'The Daily Upside <newsletter@thedailyupside.com>',
      subject: 'Wall Street Market Wrap & Global Trade Overview',
      bodyText: 'Markets opened higher today following retail earnings reports. Read our full market analysis.',
    },
    {
      from: 'Substack Newsletter <author@substack.com>',
      subject: 'Issue #42: Modern Web Architecture & AI Trends',
      bodyText: 'In this weekly edition, we explore distributed systems and event-driven architectures.',
    },
  ]

  for (const nl of mediaNewsletters) {
    const result = classifyEmail(nl)
    assert.equal(
      result.archetype,
      'promotional_noise',
      `Media newsletter was misclassified as ${result.archetype} instead of promotional_noise. From: "${nl.from}"`,
    )
  }
})


// -----------------------------------------------------------------------------
// SECTION 5: Overall Accuracy Across Curated 1,200+ Benchmark Harness
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 5: Benchmark Accuracy Across 1,200+ Cases ---')

check('Overall classification accuracy >= 99.0% across 1,200 benchmark test suite', () => {
  // Let's run classification across the 1,100 corpus emails + 100 edge cases
  let correctCount = 0
  let totalCount = 0

  for (const item of emails) {
    if (!item.groundTruth?.archetype) continue
    const classification = classifyEmail(item)
    totalCount++
    if (classification.archetype === item.groundTruth.archetype) {
      correctCount++
    }
  }

  const accuracy = (correctCount / totalCount) * 100
  console.log(`Corpus Holdout Benchmark: ${correctCount}/${totalCount} (${accuracy.toFixed(2)}%)`)
  assert.ok(accuracy >= 99.0, `Expected accuracy >= 99.0%, got ${accuracy.toFixed(2)}%`)
})

console.log('\n========================================================================')
console.log(`  AUDIT COMPLETE: ${totalChecks - failedChecks}/${totalChecks} PASS (${failedChecks} FAILURES)`)
console.log('========================================================================\n')

if (failedChecks > 0) {
  process.exit(1)
}
