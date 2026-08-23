/**
 * adversarial_stress_test.mjs
 * 
 * Comprehensive empirical stress-test suite for Milestone 2:
 * 1. Benchmark dataset schema validation, duplicate detection, and triviality audit.
 * 2. Evaluation script resilience (empty, malformed, missing fields, extreme payloads).
 * 3. Anti-leakage adversarial attack (promotional deception, return policy disclaimers, passive parcel tracking).
 * 4. Clusterer & Resolver resilience against corrupted/noisy inputs, prototype pollution, and fuzzing.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

import {
  classifyEmail,
  redactEmailPII,
} from '../../../supabase/functions/_shared/email-clusterer.mjs'

import {
  canonicalizeOrderId,
  canonicalizeTrackingNumber,
  resolveCanonicalEntity,
} from '../../../supabase/functions/_shared/canonical-order-resolver.mjs'

import { splitActionableAndTransitItems } from '../../../src/utils/needsYouFeed.ts'
import { detectSuggestedEvent } from '../../../src/utils/actionInspectionSynthesis.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '../../..')
const FIXTURE_PATH = path.join(PROJECT_ROOT, 'tests', 'fixtures', 'email-benchmark.json')

const results = {
  passed: 0,
  failed: 0,
  findings: [],
}

function assert(condition, message) {
  if (!condition) {
    results.failed++
    results.findings.push({ status: 'FAIL', message })
    console.error(`❌ FAIL: ${message}`)
  } else {
    results.passed++
    console.log(`✔ PASS: ${message}`)
  }
}

console.log('======================================================================')
console.log('  STARTING ADVERSARIAL STRESS TEST SUITE (CHALLENGER 1 - M2)')
console.log('======================================================================\n')

// -----------------------------------------------------------------------------
// SECTION 1: BENCHMARK FIXTURE SCHEMA INTEGRITY & DUPLICATE/TRIVIALITY AUDIT
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: Benchmark Dataset Integrity & Schema Edge Cases ---')

const fixtureContent = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'))
const cases = fixtureContent.benchmark_cases || fixtureContent

assert(Array.isArray(cases), 'Benchmark fixture contains array of benchmark cases')
assert(cases.length >= 200, `Benchmark fixture contains >= 200 cases (Actual: ${cases.length})`)

const VALID_ARCHETYPES = new Set([
  'logistics_parcels',
  'executive_actions',
  'temporal_appointments',
  'lifecycle_updates',
  'estate_knowledge',
  'promotional_noise',
])

const VALID_ROUTINGS = new Set([
  'delivery_transit_items',
  'actionable_items',
  'suggested_events',
  'lifecycle_patches',
  'family_knowledge_claims',
  'family_data_documents',
  'skip_noise',
])

const seenIds = new Set()
const seenSubjectAndBody = new Set()
let schemaErrors = 0
let duplicateCases = 0
let trivialCases = 0
let invalidAgencyLevels = 0
let missingRequiredFields = 0

for (let i = 0; i < cases.length; i++) {
  const c = cases[i]
  
  // ID check
  if (!c.id || typeof c.id !== 'string' || seenIds.has(c.id)) {
    schemaErrors++
    console.error(`Case [${i}] invalid or duplicate ID: ${c.id}`)
  } else {
    seenIds.add(c.id)
  }

  // Required string fields
  if (!c.sender || typeof c.sender !== 'string' || c.sender.trim() === '') missingRequiredFields++
  if (!c.subject || typeof c.subject !== 'string' || c.subject.trim() === '') missingRequiredFields++
  if (!c.body || typeof c.body !== 'string' || c.body.trim() === '') missingRequiredFields++

  // Archetype validity
  if (!VALID_ARCHETYPES.has(c.archetype)) {
    schemaErrors++
    console.error(`Case [${c.id}] invalid archetype: ${c.archetype}`)
  }

  // Routing validity
  if (!VALID_ROUTINGS.has(c.expected_routing)) {
    schemaErrors++
    console.error(`Case [${c.id}] invalid routing: ${c.expected_routing}`)
  }

  // Agency level check: must be integer 0, 1, 2, or 3
  if (typeof c.expected_agency_level !== 'number' || ![0, 1, 2, 3].includes(c.expected_agency_level)) {
    invalidAgencyLevels++
    console.error(`Case [${c.id}] invalid agency level: ${c.expected_agency_level}`)
  }

  // Duplicate text check
  const textSignature = `${c.subject.toLowerCase().trim()}:::${c.body.toLowerCase().trim()}`
  if (seenSubjectAndBody.has(textSignature)) {
    duplicateCases++
    console.error(`Duplicate case content found: [${c.id}] ${c.subject}`)
  } else {
    seenSubjectAndBody.add(textSignature)
  }

  // Triviality check: subject < 5 chars or body < 20 chars
  if (c.subject.trim().length < 5 || c.body.trim().length < 20) {
    trivialCases++
    console.warn(`Trivial case detected: [${c.id}] Subj: "${c.subject}", Body: "${c.body}"`)
  }
}

assert(schemaErrors === 0, `Schema errors in benchmark fixture is 0 (Found: ${schemaErrors})`)
assert(missingRequiredFields === 0, `Missing required fields is 0 (Found: ${missingRequiredFields})`)
assert(invalidAgencyLevels === 0, `Invalid agency levels is 0 (Found: ${invalidAgencyLevels})`)
assert(duplicateCases === 0, `Duplicate cases in benchmark is 0 (Found: ${duplicateCases})`)
assert(trivialCases === 0, `Trivial cases in benchmark is 0 (Found: ${trivialCases})`)

// Archetype distribution balance audit
const archetypeCounts = {}
for (const a of VALID_ARCHETYPES) archetypeCounts[a] = 0
for (const c of cases) archetypeCounts[c.archetype]++

console.log('Archetype Distribution in Benchmark Fixture:')
for (const [k, v] of Object.entries(archetypeCounts)) {
  console.log(`  - ${k.padEnd(24)}: ${v} cases`)
  assert(v >= 25, `Archetype ${k} has adequate representation (>=25 cases, found ${v})`)
}

// -----------------------------------------------------------------------------
// SECTION 2: EQUIVALENCE & METRIC BIAS AUDIT IN EVAL SCRIPT
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Evaluation Metric Integrity & Classification Audit ---')

// Let's audit raw classification (strict equality vs transit equivalence)
let strictCorrect = 0
let rawMismatches = []

for (const c of cases) {
  const classified = classifyEmail({ from: c.sender, subject: c.subject, bodyText: c.body })
  if (classified.archetype === c.archetype) {
    strictCorrect++
  } else {
    rawMismatches.push({
      id: c.id,
      sender: c.sender,
      subject: c.subject,
      actual: c.archetype,
      predicted: classified.archetype,
      routing: c.expected_routing,
      reasoning: classified.reasoning,
    })
  }
}

const strictAccuracy = (strictCorrect / cases.length) * 100
console.log(`Strict 1:1 Classification Accuracy (without transit equivalence): ${strictAccuracy.toFixed(2)}% (${strictCorrect}/${cases.length})`)

assert(strictAccuracy >= 98.0, `Strict 1:1 classification accuracy satisfies >= 98.0% gate (Actual: ${strictAccuracy.toFixed(2)}%)`)

if (rawMismatches.length > 0) {
  console.log(`Raw Archetype Mismatches (${rawMismatches.length}):`)
  for (const m of rawMismatches) {
    console.log(`  [${m.id}] Actual: ${m.actual} -> Predicted: ${m.predicted} (Routing: ${m.routing})`)
    console.log(`       Subj: "${m.subject}" | Reason: ${m.reasoning}`)
  }
}

// -----------------------------------------------------------------------------
// SECTION 3: ADVERSARIAL ANTI-LEAKAGE STRESS TEST
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 3: Adversarial Anti-Leakage Stress Harness ---')

const adversarialLeakageVectors = [
  // 1. Promotional urgency & deceptive "Action Required"
  {
    sender: 'deals@marketing.retailer.com',
    subject: 'ACTION REQUIRED: Confirm your 70% Off coupon code before midnight!',
    body: 'Urgent: Click here to claim your $50 voucher. This exclusive action requires immediate confirmation.',
    type: 'promotional_urgency',
  },
  {
    sender: 'vip-rewards@outlet.com',
    subject: 'FINAL NOTICE: Your reward points will expire in 2 hours. Take action now!',
    body: 'Immediate action needed to redeem your 5,000 points. Do not miss out on your cash bonus.',
    type: 'promotional_urgency',
  },
  {
    sender: 'promotions@traveldeals.com',
    subject: 'Urgent: Flight sale to Paris ends today! Review and book your seats now.',
    body: 'Action required: Complete your booking to lock in $299 transatlantic fares.',
    type: 'promotional_urgency',
  },
  // 2. Return Policy & Claim Disclaimers in Order/Delivery emails
  {
    sender: 'orders@amazon.com',
    subject: 'Your Amazon.com order #114-9988776-5544332 has shipped',
    body: 'Your package is on the way. Return Policy: Items must be returned within 30 days. Claims for missing, wrong, or damaged items must be submitted within 3 days. Any damaged merchandise returned after 30 days will be rejected.',
    type: 'return_policy_disclaimer',
  },
  {
    sender: 'delivery@walmart.com',
    subject: 'Delivered: Your Walmart InHome grocery delivery #2000109-8472910 is complete',
    body: 'Your order was delivered to your kitchen counter. If you have any issue or damaged items, please report a claim within 48 hours for a replacement or refund.',
    type: 'return_policy_disclaimer',
  },
  {
    sender: 'ship-notify@ups.com',
    subject: 'UPS Delivery Notification, Tracking Number 1Z9999999999999999',
    body: 'Your package has been delivered to the front porch. For claims regarding missing packages, please contact the shipper within 14 days.',
    type: 'return_policy_disclaimer',
  },
  // 3. Passive logistics tracking updates
  {
    sender: 'trackingupdates@fedex.com',
    subject: 'FedEx Shipment Notification: 9261299991094820194820 Out for Delivery',
    body: 'Estimated delivery between 11:00 AM and 3:00 PM today. Signature not required. Driver is en route.',
    type: 'passive_tracking',
  },
  // 4. Estate newsletters with action words
  {
    sender: 'hoa-board@mirasolcommunity.org',
    subject: 'Mirasol HOA Monthly Digest: Pool renovation update and tennis court rules',
    body: 'Please review the new community guidelines for pool usage. Residents are reminded to keep gate closed.',
    type: 'estate_newsletter',
  },
]

let leakageFailures = 0

for (const vec of adversarialLeakageVectors) {
  const classified = classifyEmail({
    from: vec.sender,
    subject: vec.subject,
    bodyText: vec.body,
  })

  // Test partitioning in needsYouFeed
  const prepItem = {
    id: `adv_${Math.random()}`,
    event_title: vec.subject,
    description: vec.body,
    source_type: 'gmail',
    attention_vendor: classified.vendor || null,
    attention_stage: classified.stage || null,
    agency_level: classified.agencyLevel,
    dismissed: false,
  }

  const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([prepItem])

  // Anti-leakage rule: these adversarial vectors must NEVER become actionable items or have agencyLevel >= 2
  const leakedToActionQueue = actionableItems.length > 0
  const leakedArchetype = classified.archetype === 'executive_actions'
  const leakedAgency = classified.agencyLevel >= 2

  if (leakedToActionQueue || leakedArchetype || leakedAgency) {
    leakageFailures++
    console.error(`🚨 LEAKAGE DETECTED: [${vec.type}] "${vec.subject}" -> Archetype: ${classified.archetype}, Agency: ${classified.agencyLevel}, In Actionable Queue: ${leakedToActionQueue}`)
  } else {
    console.log(`🛡️ LEAKAGE BLOCKED: [${vec.type}] "${vec.subject}" -> Archetype: ${classified.archetype}, Agency: ${classified.agencyLevel}`)
  }
}

assert(leakageFailures === 0, `Zero false action leakage on adversarial vectors (Failures: ${leakageFailures})`)

// -----------------------------------------------------------------------------
// SECTION 4: CLUSTERER & CANONICAL RESOLVER CORRUPTED / FUZZ INPUTS
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 4: Fuzzing & Malformed Input Robustness ---')

const fuzzInputs = [
  // Null / undefined / empty
  { from: null, subject: null, bodyText: null },
  { from: '', subject: '', bodyText: '' },
  { from: 12345, subject: false, bodyText: {} },
  // Huge string (100KB)
  {
    from: 'test@example.com',
    subject: 'A'.repeat(5000),
    bodyText: 'B'.repeat(100000),
  },
  // Prototype pollution attack in strings & objects
  {
    from: '__proto__.polluted@attacker.com',
    subject: 'constructor.prototype.evil = true',
    bodyText: '{"__proto__": {"admin": true}}',
  },
  // Unicode control characters, RTL overrides, null bytes
  {
    from: 'attacker\u0000@evil.com',
    subject: '\u202E\u0000Special Order Confirmation # 114-1234567-8901234',
    bodyText: 'Delivery arrived \u200B\u200C\u200D\uFEFF safely.',
  },
  // Ambiguous multi-vendor text
  {
    from: 'notify@amazon.com',
    subject: 'Amazon Walmart Target combined order # 114-2233445-5566778 and 2000109-8472910',
    bodyText: 'Shipped via UPS 1Z2925037075729104 and FedEx 9261299991094820194820',
  },
]

let fuzzCrashes = 0
for (let i = 0; i < fuzzInputs.length; i++) {
  const inp = fuzzInputs[i]
  try {
    const res = classifyEmail(inp)
    assert(res && typeof res.archetype === 'string', `Fuzz case ${i} returns valid archetype result without crash`)
  } catch (err) {
    fuzzCrashes++
    console.error(`Crash on fuzz input ${i}:`, err)
  }
}
assert(fuzzCrashes === 0, `No crashes on malformed/fuzz clusterer inputs (Crashes: ${fuzzCrashes})`)

// Canonical Order Resolver Fuzzing
const resolverFuzzCases = [
  { vendor: 'Amazon', order: '114-1234567-8901234', expected: '114-1234567-8901234' },
  { vendor: 'Amazon', order: '  114-1234567-8901234  ', expected: '114-1234567-8901234' },
  { vendor: 'Walmart', order: 'Order # 2000109-8472910', expected: '2000109-8472910' },
  { vendor: 'Walmart', order: '20001098472910', expected: '2000109-8472910' },
  { vendor: 'Apple', order: 'w1029384756', expected: 'W1029384756' },
  { vendor: 'Nike', order: 'c0123456789', expected: 'C0123456789' },
  { vendor: 'Target', order: '982019482019', expected: '982019482019' },
  { vendor: null, order: null, expected: null },
  { vendor: 'UnknownVendor', order: 'ABC-123-XYZ', expected: 'ABC-123-XYZ' },
]

let resolverFuzzErrors = 0
for (const rc of resolverFuzzCases) {
  try {
    const canon = canonicalizeOrderId(rc.vendor, rc.order)
    if (rc.expected !== undefined && canon !== rc.expected) {
      resolverFuzzErrors++
      console.error(`Resolver mismatch for ${rc.vendor} / ${rc.order}: expected "${rc.expected}", got "${canon}"`)
    }
  } catch (err) {
    resolverFuzzErrors++
    console.error(`Resolver crash on ${rc.vendor} / ${rc.order}:`, err)
  }
}
assert(resolverFuzzErrors === 0, `Resolver handles all normalization cases without error (Errors: ${resolverFuzzErrors})`)

// -----------------------------------------------------------------------------
// SECTION 5: EVALUATION SCRIPT CLI ERROR RESILIENCE
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 5: Evaluation Script Resilience Testing ---')

// Let's test with corrupt fixture file
const corruptFixturePath = path.join(__dirname, 'corrupt_fixture_temp.json')
fs.writeFileSync(corruptFixturePath, JSON.stringify({
  benchmark_cases: [
    { id: 'MALFORMED-1', sender: '', subject: 'test', body: 'test', archetype: 'invalid_arch' },
    { id: 'MALFORMED-2' } // missing almost everything
  ]
}))

console.log('Created temporary corrupt fixture to test harness tolerance.')

// Run eval script against corrupt fixture
import { execSync } from 'node:child_process'
let evalGraceful = true
try {
  const evalOut = execSync(`node scripts/email-benchmark-eval.mjs --fixture "${corruptFixturePath}"`, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  })
  console.log('Eval runner completed on corrupt fixture with exit code 0 or handled output.')
} catch (err) {
  // If exit code is 1 due to accuracy failure or leakage, that's expected and graceful
  if (err.status === 1) {
    console.log('Eval runner exited with code 1 (expected gate failure on corrupt fixture).')
  } else {
    evalGraceful = false
    console.error('Eval runner unhandled exception on corrupt fixture:', err.stderr || err.message)
  }
}
fs.unlinkSync(corruptFixturePath)
assert(evalGraceful, 'Evaluation runner handles corrupt fixture without unhandled crash')

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n======================================================================')
console.log(`  ADVERSARIAL STRESS TEST SUMMARY`)
console.log(`  Passed: ${results.passed} | Failed: ${results.failed}`)
console.log('======================================================================')

process.exit(results.failed === 0 ? 0 : 1)
