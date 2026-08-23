// .agents/challenger_m4_2/test_stress.mjs
/**
 * Adversarial Stress Test Suite for Milestone 4:
 * Compound Decomposer, Date Anchoring, Origin Tagging, Sibling Linkage, and Zero Noise Leakage.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  anchorRelativeDate,
  decomposeCompoundEmail,
  formatCompoundDecomposerPrompt,
  isCompoundEmail,
  parseCompoundDecomposerResponse,
} from '../../supabase/functions/_shared/compound-decomposer.mjs'

import {
  applyCaptureRules,
  matchCaptureRules,
  parseVoiceDirective,
  isCaptureRuleDirective,
  resolveCaptureCommand,
} from '../../supabase/functions/_shared/capture-command-router.mjs'

import {
  scoreExemplar,
  scoreAndRankExemplars,
  retrieveFewShotExemplars,
  getDefaultGoldenExemplars,
  formatFewShotPromptBlock,
} from '../../supabase/functions/_shared/few-shot-exemplar-store.mjs'

import { splitActionableAndTransitItems } from '../../src/utils/needsYouFeed.ts'

import {
  isDeliveryTransitItem,
  buildDeliveryTransitItem,
  resolveCanonicalEntity,
  consolidateTransitItems,
  extractPolicyDisclaimer,
  isPerishableDelivery,
} from '../../src/utils/vendorTransactions.ts'

// =========================================================================
// SUITE 1: ADVERSARIAL DATE ANCHORING & YEAR/MONTH/LEAP BOUNDARIES
// =========================================================================

test('STRESS-DATE-01: Year Boundary Rollover (Dec 31 -> Jan relative days)', () => {
  const dec31 = '2026-12-31T23:59:59.000Z'

  // "tomorrow" on Dec 31 -> Jan 1 of next year
  const tomorrow = anchorRelativeDate('tomorrow at 9:00 am', dec31)
  assert.equal(tomorrow.dateStr, '2027-01-01', 'Dec 31 tomorrow must roll over to 2027-01-01')
  assert.equal(tomorrow.isAllDay, false)
  assert.ok(tomorrow.isoString.includes('2027-01-01T09:00:00'))

  // "in 3 days" on Dec 31 -> Jan 3 of next year
  const in3Days = anchorRelativeDate('in 3 days', dec31)
  assert.equal(in3Days.dateStr, '2027-01-03', 'Dec 31 in 3 days must roll over to 2027-01-03')

  // "in 15 days" on Dec 31 -> Jan 15 of next year
  const in15Days = anchorRelativeDate('in 15 days', dec31)
  assert.equal(in15Days.dateStr, '2027-01-15', 'Dec 31 in 15 days must roll over to 2027-01-15')
})

test('STRESS-DATE-02: Academic Year Rollover (Nov/Dec email referencing Jan/Feb/Mar)', () => {
  const dec15 = '2026-12-15T10:00:00.000Z'
  const nov10 = '2026-11-10T14:30:00.000Z'
  const oct20 = '2026-10-20T08:00:00.000Z'

  // Dec 15 email referencing "Jan 5"
  const jan5 = anchorRelativeDate('Jan 5 at 10am', dec15)
  assert.equal(jan5.dateStr, '2027-01-05', 'Dec email referencing Jan 5 must resolve to 2027-01-05')

  // Dec 15 email referencing "January 18th"
  const jan18 = anchorRelativeDate('January 18th at 2:30 pm', dec15)
  assert.equal(jan18.dateStr, '2027-01-18', 'Dec email referencing Jan 18 must resolve to 2027-01-18')

  // Nov 10 email referencing "Feb 12"
  const feb12 = anchorRelativeDate('Feb 12', nov10)
  assert.equal(feb12.dateStr, '2027-02-12', 'Nov email referencing Feb 12 must resolve to 2027-02-12')

  // Oct 20 email referencing "March 1st"
  const mar1 = anchorRelativeDate('March 1st at 8:00 am', oct20)
  assert.equal(mar1.dateStr, '2027-03-01', 'Oct email referencing March 1st must resolve to 2027-03-01')
})

test('STRESS-DATE-03: Weekday Shifts Across Month/Year Boundaries', () => {
  // 2026-12-30 is a Wednesday (UTC)
  const wedDec30 = '2026-12-30T12:00:00.000Z'

  // "this Friday" -> 2026-12-30 + 2 days = 2027-01-01 (Friday)
  const friday = anchorRelativeDate('this Friday at 3:00 pm', wedDec30)
  assert.equal(friday.dateStr, '2027-01-01', 'Wednesday Dec 30 this Friday must be Friday Jan 1, 2027')

  // "on Monday" -> 2026-12-30 + 5 days = 2027-01-04 (Monday)
  const monday = anchorRelativeDate('on Monday at 8:30 am', wedDec30)
  assert.equal(monday.dateStr, '2027-01-04', 'Wednesday Dec 30 on Monday must be Monday Jan 4, 2027')

  // 2026-08-30 is Sunday
  const sunAug30 = '2026-08-30T12:00:00.000Z'
  const tueSep1 = anchorRelativeDate('on Tuesday at 9am', sunAug30)
  assert.equal(tueSep1.dateStr, '2026-09-01', 'Sunday Aug 30 on Tuesday must be Tuesday Sep 1, 2026')
})

test('STRESS-DATE-04: Leap Year & Month Overflow Transitions', () => {
  // 2028 is a leap year
  const leapFeb28 = '2028-02-28T12:00:00.000Z'
  const leapTomorrow = anchorRelativeDate('tomorrow', leapFeb28)
  assert.equal(leapTomorrow.dateStr, '2028-02-29', 'Leap year Feb 28 tomorrow must be Feb 29, 2028')

  // 2026 is non-leap
  const nonLeapFeb28 = '2026-02-28T12:00:00.000Z'
  const nonLeapTomorrow = anchorRelativeDate('tomorrow', nonLeapFeb28)
  assert.equal(nonLeapTomorrow.dateStr, '2026-03-01', 'Non-leap year Feb 28 tomorrow must be March 1, 2026')

  // Month-end rollover (July 31 -> "in 2 days" -> Aug 2)
  const jul31 = '2026-07-31T12:00:00.000Z'
  const in2Days = anchorRelativeDate('in 2 days', jul31)
  assert.equal(in2Days.dateStr, '2026-08-02', 'July 31 in 2 days must be Aug 2')
})

test('STRESS-DATE-05: Time Extraction Edge Cases (12am, 12pm, morning, tonight, evening)', () => {
  const anchor = '2026-08-20T12:00:00.000Z'

  // 12:00 PM (Noon)
  const noon = anchorRelativeDate('Aug 25 at 12:00 pm', anchor)
  assert.ok(noon.isoString.includes('T12:00:00'), '12:00 PM must be hour 12')
  assert.equal(noon.isAllDay, false)

  // 12:00 AM (Midnight)
  const midnight = anchorRelativeDate('Aug 25 at 12:00 am', anchor)
  assert.ok(midnight.isoString.includes('T00:00:00'), '12:00 AM must be hour 00')

  // 12:30 PM
  const noonHalf = anchorRelativeDate('Aug 25 at 12:30 pm', anchor)
  assert.ok(noonHalf.isoString.includes('T12:30:00'), '12:30 PM must be 12:30')

  // 12:30 AM
  const midHalf = anchorRelativeDate('Aug 25 at 12:30 am', anchor)
  assert.ok(midHalf.isoString.includes('T00:30:00'), '12:30 AM must be 00:30')

  // Special named times
  const tonight = anchorRelativeDate('tonight', anchor)
  assert.ok(tonight.isoString.includes('T20:00:00'), 'tonight must default to 20:00')

  const morning = anchorRelativeDate('this morning', anchor)
  assert.ok(morning.isoString.includes('T09:00:00'), 'this morning must default to 09:00')

  const afternoon = anchorRelativeDate('this afternoon', anchor)
  assert.ok(afternoon.isoString.includes('T14:00:00'), 'this afternoon must default to 14:00')

  const evening = anchorRelativeDate('this evening', anchor)
  assert.ok(evening.isoString.includes('T19:00:00'), 'this evening must default to 19:00')
})

test('STRESS-DATE-06: Fuzzing & Malformed Date Fallback Resiliency', () => {
  const defaultAnchor = '2026-08-20T12:00:00.000Z'

  // Null, undefined, empty, number, boolean
  const rNull = anchorRelativeDate(null, defaultAnchor)
  assert.equal(rNull.dateStr, '2026-08-20')
  assert.equal(rNull.isAllDay, true)

  const rUndefined = anchorRelativeDate(undefined, defaultAnchor)
  assert.equal(rUndefined.dateStr, '2026-08-20')

  const rEmpty = anchorRelativeDate('', defaultAnchor)
  assert.equal(rEmpty.dateStr, '2026-08-20')

  const rInvalidAnchor = anchorRelativeDate('tomorrow', 'invalid-date-string')
  assert.equal(typeof rInvalidAnchor.dateStr, 'string')
  assert.ok(rInvalidAnchor.dateStr.startsWith('2026-08-'))

  // Explicit ISO string in text
  const rIso = anchorRelativeDate('Event scheduled for 2026-11-28', defaultAnchor)
  assert.equal(rIso.dateStr, '2026-11-28')
})

// =========================================================================
// SUITE 2: MULTI-EVENT EXTRACTION, DENSE SCHEDULES & SIBLING LINKAGE
// =========================================================================

test('STRESS-DECOMP-01: Dense Multi-Date Schedule Decomposition (5 events + 2 actions)', () => {
  const complexLlmResponse = JSON.stringify({
    isCompound: true,
    summary: 'Palm Beach High Athletic Season Schedule & Required Consent Forms',
    extractedActions: [
      {
        id: 'act-1',
        sourceType: 'attachment',
        sourceRef: '2026_Athletic_Physical_Consent.pdf',
        archetype: 'executive_actions',
        title: 'Submit Sports Physical & Consent Form',
        summary: 'Signed physical packet required before first practice',
        dueDate: '2026-08-24',
        actionType: 'waiver',
        urgency: 'high',
        agencyLevel: 3,
        assignedMember: 'Owen',
      },
      {
        id: 'act-2',
        sourceType: 'email_body',
        sourceRef: 'msg-complex-01',
        archetype: 'executive_actions',
        title: 'Pay Athletic Activity Fee ($75.00)',
        summary: 'Submit via SchoolCashOnline before roster finalization',
        dueDate: '2026-08-28',
        actionType: 'payment',
        urgency: 'medium',
        agencyLevel: 2,
        assignedMember: 'Owen',
      },
    ],
    suggestedAppointments: [
      {
        id: 'apt-1',
        sourceType: 'email_body',
        archetype: 'temporal_appointments',
        title: 'Varsity Soccer Tryouts Day 1',
        eventDate: '2026-08-24T16:00:00-04:00',
        location: 'High School Turf Field',
        agencyLevel: 0,
        assignedMember: 'Owen',
      },
      {
        id: 'apt-2',
        sourceType: 'email_body',
        archetype: 'temporal_appointments',
        title: 'Varsity Soccer Tryouts Day 2',
        eventDate: '2026-08-25T16:00:00-04:00',
        location: 'High School Turf Field',
        agencyLevel: 0,
        assignedMember: 'Owen',
      },
      {
        id: 'apt-3',
        sourceType: 'email_body',
        archetype: 'temporal_appointments',
        title: 'Parent Booster Club Orientation',
        eventDate: '2026-08-26T18:30:00-04:00',
        location: 'Media Center Room 204',
        agencyLevel: 0,
        assignedMember: 'Kelly',
      },
      {
        id: 'apt-4',
        sourceType: 'attachment',
        sourceRef: '2026_Athletic_Schedule.pdf',
        archetype: 'temporal_appointments',
        title: 'Season Kickoff Game vs Jupiter High',
        eventDate: '2026-09-04T19:00:00-04:00',
        location: 'Jupiter Stadium',
        agencyLevel: 0,
        assignedMember: 'Owen',
      },
    ],
    knowledgeNotes: [
      'Uniform distribution: Uniforms handed out after team selection on Wednesday.',
      'Hydration policy: Players must bring personal 64oz water cooler.',
    ],
  })

  const parsed = parseCompoundDecomposerResponse(complexLlmResponse, '2026-08-20', 'msg-complex-01')

  assert.equal(parsed.isCompound, true)
  assert.equal(parsed.extractedActions.length, 2)
  assert.equal(parsed.suggestedAppointments.length, 4)
  assert.equal(parsed.knowledgeNotes.length, 2)

  // Total items = 6
  const totalItemCount = parsed.extractedActions.length + parsed.suggestedAppointments.length
  assert.equal(totalItemCount, 6)

  // Check that every item has exactly 5 siblingActionIds (all siblings excluding itself)
  for (const action of parsed.extractedActions) {
    assert.equal(action.siblingActionIds.length, 5, `Action ${action.id} must have exactly 5 siblings`)
    assert.ok(!action.siblingActionIds.includes(action.id), 'Sibling list must not contain self')
  }

  for (const apt of parsed.suggestedAppointments) {
    assert.equal(apt.siblingActionIds.length, 5, `Appointment ${apt.id} must have exactly 5 siblings`)
    assert.ok(!apt.siblingActionIds.includes(apt.id), 'Sibling list must not contain self')
  }

  // Check source origin tagging
  assert.equal(parsed.extractedActions[0].sourceType, 'attachment')
  assert.equal(parsed.extractedActions[0].sourceRef, '2026_Athletic_Physical_Consent.pdf')
  assert.equal(parsed.extractedActions[1].sourceType, 'email_body')
  assert.equal(parsed.suggestedAppointments[3].sourceType, 'attachment')
})

test('STRESS-DECOMP-02: Missing Fields & Default Fallback Handling in Parser', () => {
  // Response where actions and appointments lack ids, sourceTypes, and agencyLevels
  const sparseResponse = JSON.stringify({
    isCompound: true,
    summary: 'Sparse email items',
    extractedActions: [
      {
        title: 'Return Library Book',
        dueDate: '2026-08-28',
      },
    ],
    suggestedAppointments: [
      {
        title: 'Library Story Hour',
        eventDate: '2026-08-28T10:00:00-04:00',
      },
    ],
  })

  const parsed = parseCompoundDecomposerResponse(sparseResponse, '2026-08-20', 'msg-sparse-99')
  assert.equal(parsed.isCompound, true)
  assert.equal(parsed.extractedActions.length, 1)
  assert.equal(parsed.suggestedAppointments.length, 1)

  const act = parsed.extractedActions[0]
  assert.equal(act.id, 'act-1-msg-sparse-99', 'Must generate synthetic deterministic ID')
  assert.equal(act.sourceType, 'email_body', 'Must default missing sourceType to email_body')
  assert.equal(act.agencyLevel, 2, 'Must default missing action agencyLevel to 2')
  assert.deepEqual(act.siblingActionIds, ['apt-1-msg-sparse-99'])

  const apt = parsed.suggestedAppointments[0]
  assert.equal(apt.id, 'apt-1-msg-sparse-99')
  assert.equal(apt.sourceType, 'email_body')
  assert.equal(apt.agencyLevel, 0, 'Must default appointment agencyLevel to 0')
  assert.deepEqual(apt.siblingActionIds, ['act-1-msg-sparse-99'])
})

test('STRESS-DECOMP-03: Corrupt JSON & Markdown Code Block Stripping Resilience', () => {
  // Response wrapped in markdown block
  const markdownWrapped = `\`\`\`json
{
  "isCompound": true,
  "summary": "Clean markdown test",
  "extractedActions": [
    { "title": "Pay fee", "agencyLevel": 2 }
  ],
  "suggestedAppointments": [],
  "knowledgeNotes": []
}
\`\`\``
  const parsedClean = parseCompoundDecomposerResponse(markdownWrapped, '2026-08-20', 'msg-md-1')
  assert.equal(parsedClean.isCompound, true)
  assert.equal(parsedClean.extractedActions.length, 1)

  // Completely invalid JSON returns graceful fallback without crashing
  const invalidJson = `{ this is not valid json at all ::: `
  const parsedCorrupt = parseCompoundDecomposerResponse(invalidJson, '2026-08-20', 'msg-corrupt-1')
  assert.equal(parsedCorrupt.isCompound, false)
  assert.equal(parsedCorrupt.extractedActions.length, 0)
  assert.equal(parsedCorrupt.suggestedAppointments.length, 0)
  assert.equal(parsedCorrupt.summary, 'Decomposition parse failed')
})

test('STRESS-DECOMP-04: Fast-path Compound Email Detection Heuristics', () => {
  // Test multiple detection triggers
  const compoundByAttachment = {
    subject: 'School update',
    bodyText: 'See attached flyer',
    attachments: [{ filename: 'Science_Camp_Waiver.pdf' }],
  }
  assert.equal(isCompoundEmail(compoundByAttachment), true)

  const compoundByDates = {
    subject: 'General Info',
    bodyText: 'We will meet on Monday August 24 and again on Thursday August 27.',
  }
  assert.equal(isCompoundEmail(compoundByDates), true)

  const compoundByActions = {
    subject: 'Action packet',
    bodyText: 'Please sign the waiver and bring payment due on September 5.',
  }
  assert.equal(isCompoundEmail(compoundByActions), true)

  const nonCompound = {
    subject: 'Simple question',
    bodyText: 'Are you available to chat later today?',
  }
  assert.equal(isCompoundEmail(nonCompound), false)
})

// =========================================================================
// SUITE 3: ZERO NOISE LEAKAGE & PARTITIONING GUARANTEES
// =========================================================================

test('STRESS-NOISE-01: Return/Claim Policy Disclaimers NEVER leak into Action Queue', () => {
  const policyDisclaimers = [
    {
      id: 'item-policy-1',
      description: 'Claims for missing, wrong, or damaged items must be made within 3 days of delivery.',
      event_title: 'Jiffy.com Order Shipment #2541442349',
      agency_level: 0,
      priority: 1,
      dismissed: false,
      created_at: '2026-08-20T10:00:00Z',
      source_type: 'gmail',
      source_ref: 'gmail:msg-jiffy-policy',
    },
    {
      id: 'item-policy-2',
      description: 'Items eligible for return within 30 days of delivery date. Return window closes Sep 20.',
      event_title: 'Amazon Order Delivered #112-8472910-4829103',
      agency_level: 0,
      priority: 1,
      dismissed: false,
      created_at: '2026-08-21T11:00:00Z',
      source_type: 'gmail',
      source_ref: 'gmail:msg-amz-return',
    },
    {
      id: 'item-policy-3',
      description: 'Claims must be made within 48 hours for perishable items.',
      event_title: 'HelloFresh Box Delivered #HF-9928172',
      agency_level: 0,
      priority: 1,
      dismissed: false,
      created_at: '2026-08-22T09:00:00Z',
      source_type: 'gmail',
      source_ref: 'gmail:msg-hf-disclaimer',
    },
  ]

  // Test extraction of disclaimer
  for (const item of policyDisclaimers) {
    const disclaimer = extractPolicyDisclaimer(`${item.event_title} ${item.description}`)
    assert.ok(disclaimer !== null, `Must detect policy disclaimer in: ${item.description}`)
  }

  // Test partition via splitActionableAndTransitItems
  const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems(policyDisclaimers)
  assert.equal(actionableItems.length, 0, 'ZERO policy disclaimer items must leak into actionableItems')
  assert.equal(deliveryTransitItems.length, 3, 'All 3 items must be partitioned to deliveryTransitItems')
})

test('STRESS-NOISE-02: Courier Tracking & Status Disclaimers NEVER leak into Action Queue', () => {
  const logisticsItems = [
    {
      id: 'item-ups-1',
      description: 'Your package is out for delivery with UPS driver. Tracking 1Z9999999999999999.',
      event_title: 'UPS Delivery Alert',
      agency_level: 0,
      priority: 1,
      dismissed: false,
      created_at: '2026-08-20T08:00:00Z',
      source_type: 'gmail',
      source_ref: 'gmail:msg-ups-01',
    },
    {
      id: 'item-fedex-2',
      description: 'Dispatched via FedEx tracking 789456123012. Expected delivery by 4:30 PM.',
      event_title: 'FedEx Shipment Notification',
      agency_level: 0,
      priority: 1,
      dismissed: false,
      created_at: '2026-08-20T09:00:00Z',
      source_type: 'gmail',
      source_ref: 'gmail:msg-fedex-01',
    },
    {
      id: 'item-usps-3',
      description: 'Your USPS package 9400100000000000000000 was delivered to mailbox.',
      event_title: 'USPS Delivered',
      agency_level: 0,
      priority: 1,
      dismissed: false,
      created_at: '2026-08-20T10:00:00Z',
      source_type: 'gmail',
      source_ref: 'gmail:msg-usps-01',
    },
  ]

  const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems(logisticsItems)
  assert.equal(actionableItems.length, 0, 'ZERO courier tracking items must leak into Action Queue')
  assert.equal(deliveryTransitItems.length, 3, 'All 3 courier items must route to transit feed')
})

test('STRESS-NOISE-03: Marketing & Promotional Noise Cleanly Filtered via Capture Rules', () => {
  const promoEmail = {
    id: 'msg-promo-01',
    sender: 'deals@promotions.jiffy.com',
    from: 'deals@promotions.jiffy.com',
    domain: 'jiffy.com',
    subject: 'Labor Day Sale: 30% Off All Custom Shirts',
    bodyText: 'Huge savings this weekend only. Shop now before inventory runs out!',
    agency_level: 0,
  }

  const rules = [
    {
      id: 'rule-jiffy-suppress',
      pattern_type: 'domain',
      pattern_value: 'jiffy.com',
      rule_directive: 'suppress',
      default_archetype: 'promotional_noise',
      confidence: 1.0,
      active: true,
    },
  ]

  const matched = matchCaptureRules(rules, promoEmail)
  assert.ok(matched.length > 0, 'Must match suppression rule for jiffy.com')
  assert.equal(matched[0].rule_directive, 'suppress')

  const { candidate, appliedRule } = applyCaptureRules(promoEmail, rules)
  assert.equal(candidate.archetype, 'promotional_noise')
  assert.equal(candidate.agency_level, 0, 'Suppressed promotional email must have agency_level = 0')
  assert.equal(candidate.intent, 'skip')
})

test('STRESS-NOISE-04: Genuine Executive Tasks DO route to Action Queue (agency_level >= 1)', () => {
  const mixedItems = [
    {
      id: 'item-task-waiver',
      description: 'Sign Science Camp Permission & Medical Release Waiver for Liv',
      agency_level: 3,
      priority: 3,
      dismissed: false,
      created_at: '2026-08-20T10:00:00Z',
    },
    {
      id: 'item-task-bill',
      description: 'Pay FPL monthly electric bill ($241.18)',
      agency_level: 2,
      priority: 2,
      dismissed: false,
      created_at: '2026-08-20T11:00:00Z',
    },
    {
      id: 'item-transit-amazon',
      description: 'Amazon order 112-8472910-4829103 has shipped via UPS',
      agency_level: 0,
      priority: 1,
      dismissed: false,
      created_at: '2026-08-20T12:00:00Z',
    },
  ]

  const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems(mixedItems)
  assert.equal(actionableItems.length, 2, 'Must route exactly 2 actionable items to Action Queue')
  assert.equal(actionableItems[0].id, 'item-task-waiver')
  assert.equal(actionableItems[1].id, 'item-task-bill')
  assert.equal(deliveryTransitItems.length, 1, 'Must route 1 transit item away from Action Queue')
})

// =========================================================================
// SUITE 4: VOICE DIRECTIVE & ACTIVE LEARNING INTEGRATION
// =========================================================================

test('STRESS-LEARN-01: Voice Directives Synthesis for Household Capture Rules', () => {
  // 1. Informational Directive
  const directive1 = parseVoiceDirective('tennis updates are informational')
  assert.equal(directive1.pattern_type, 'phrase')
  assert.equal(directive1.pattern_value, 'tennis updates')
  assert.equal(directive1.rule_directive, 'route_archetype')
  assert.equal(directive1.default_archetype, 'estate_knowledge')
  assert.equal(directive1.confidence, 0.95)

  // 2. Logistics Directive
  const directive2 = parseVoiceDirective('always track bakery receipts as logistics')
  assert.equal(directive2.pattern_type, 'phrase')
  assert.equal(directive2.pattern_value, 'bakery receipts')
  assert.equal(directive2.rule_directive, 'route_archetype')
  assert.equal(directive2.default_archetype, 'logistics_parcels')

  // 3. Action Elevation Directive
  const directive3 = parseVoiceDirective('only alert on field trip waivers')
  assert.equal(directive3.pattern_type, 'phrase')
  assert.equal(directive3.pattern_value, 'field trip waivers')
  assert.equal(directive3.rule_directive, 'elevate_action')
  assert.equal(directive3.default_archetype, 'executive_actions')

  // 4. Suppression Directive
  const directive4 = parseVoiceDirective('stop extracting flyers from jiffy.com')
  assert.equal(directive4.pattern_type, 'domain')
  assert.equal(directive4.pattern_value, 'jiffy.com')
  assert.equal(directive4.rule_directive, 'suppress')
  assert.equal(directive4.default_archetype, 'promotional_noise')

  // 5. Untrain Directive
  const directive5 = parseVoiceDirective('forget rule for tennis updates')
  assert.equal(directive5.origin, 'user_untrain')
  assert.equal(directive5.active, false)
})

test('STRESS-LEARN-02: Rule Precedence Hierarchy (Sender > Domain > Subject > Phrase)', () => {
  const email = {
    sender: 'coach-sarah@tennisacademy.com',
    from: 'coach-sarah@tennisacademy.com',
    domain: 'tennisacademy.com',
    subject: 'Urgent: Tournament Schedule & Liability Waiver',
  }

  const conflictingRules = [
    {
      id: 'rule-phrase',
      pattern_type: 'phrase',
      pattern_value: 'tournament schedule',
      rule_directive: 'route_archetype',
      default_archetype: 'estate_knowledge',
      confidence: 0.8,
      active: true,
    },
    {
      id: 'rule-domain',
      pattern_type: 'domain',
      pattern_value: 'tennisacademy.com',
      rule_directive: 'route_archetype',
      default_archetype: 'temporal_appointments',
      confidence: 0.9,
      active: true,
    },
    {
      id: 'rule-sender',
      pattern_type: 'sender',
      pattern_value: 'coach-sarah@tennisacademy.com',
      rule_directive: 'elevate_action',
      default_archetype: 'executive_actions',
      confidence: 1.0,
      active: true,
    },
  ]

  const matched = matchCaptureRules(conflictingRules, email)
  assert.ok(matched.length > 0)
  assert.equal(matched[0].id, 'rule-sender', 'Sender-specific rule must take highest precedence over domain and phrase rules')
  assert.equal(matched[0].rule_directive, 'elevate_action')
})

test('STRESS-LEARN-03: Quick Actions Safety (Voice directives do not break groceries/reminders)', () => {
  // Voice rule directive
  const ruleCmd = resolveCaptureCommand('tennis updates are informational')
  assert.equal(ruleCmd.status, 'execute')
  assert.equal(ruleCmd.tool, 'upsert_capture_rule')

  // Quick action: Grocery
  const groceryCmd = resolveCaptureCommand('add 2 gallons organic milk to grocery list')
  assert.equal(groceryCmd.status, 'execute')
  assert.equal(groceryCmd.tool, 'add_grocery_items')

  // Quick action: Reminder
  const reminderCmd = resolveCaptureCommand('remind me to call pediatrician tomorrow at 10am', { utcOffset: '-04:00' })
  assert.equal(reminderCmd.status, 'execute')
  assert.equal(reminderCmd.tool, 'create_event')
})

// =========================================================================
// SUITE 5: FEW-SHOT EXEMPLAR RETRIEVAL & PROMPT INJECTION
// =========================================================================

test('STRESS-FEWSHOT-01: Exemplar Scoring & Ranking Discrimination', () => {
  const targetEmail = {
    domain: 'walmart.com',
    sender: 'help@walmart.com',
    from: 'help@walmart.com',
    subject: 'Thanks for your InHome delivery order',
    archetype: 'logistics_parcels',
  }

  const goldenSeeds = getDefaultGoldenExemplars()
  const ranked = scoreAndRankExemplars(goldenSeeds, targetEmail, { limit: 3 })

  assert.ok(ranked.length > 0)
  assert.equal(ranked[0].domain, 'walmart.com', 'Top-ranked exemplar must match walmart.com domain')
  assert.equal(ranked[0].email_archetype, 'logistics_parcels')

  const score = scoreExemplar(ranked[0], targetEmail)
  assert.ok(score >= 60, `Exact domain match must have strong score: got ${score}`)

  const promptBlock = formatFewShotPromptBlock(ranked)
  assert.ok(promptBlock.includes('REFERENCE GOLDEN EXTRACTION EXEMPLARS'))
  assert.ok(promptBlock.includes('walmart.com'))
  assert.ok(promptBlock.includes('logistics_parcels'))
})

test('STRESS-FEWSHOT-02: Archetype-Specific Retrieval Across All 6 Archetypes', () => {
  const archetypes = [
    'logistics_parcels',
    'executive_actions',
    'temporal_appointments',
    'lifecycle_updates',
    'estate_knowledge',
    'promotional_noise',
  ]

  const goldenSeeds = getDefaultGoldenExemplars()

  for (const arch of archetypes) {
    const query = { archetype: arch, subject: `Generic ${arch} inquiry` }
    const ranked = scoreAndRankExemplars(goldenSeeds, query, { limit: 1, minScore: 10 })
    assert.ok(ranked.length > 0, `Must retrieve at least 1 exemplar for archetype ${arch}`)
    assert.equal(ranked[0].email_archetype, arch, `Retrieved exemplar must match requested archetype ${arch}`)
  }
})
