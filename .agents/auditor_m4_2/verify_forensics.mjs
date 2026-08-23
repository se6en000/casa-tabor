// .agents/auditor_m4_2/verify_forensics.mjs
/**
 * Independent Forensic Audit Verification Script for Milestone 4
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
  synthesizeFeedbackRule,
} from '../../supabase/functions/_shared/capture-command-router.mjs'

import {
  scoreExemplar,
  scoreAndRankExemplars,
  retrieveFewShotExemplars,
  getDefaultGoldenExemplars,
  formatFewShotPromptBlock,
  tokenizeText,
  calculateJaccardSimilarity,
  clearExemplarCache,
} from '../../supabase/functions/_shared/few-shot-exemplar-store.mjs'

import { splitActionableAndTransitItems } from '../../src/utils/needsYouFeed.ts'

// =========================================================================
// TEST SUITE 1: DYNAMIC & ADVERSARIAL VOICE DIRECTIVES
// =========================================================================

test('AUDIT-VOICE-01: Voice directive variations with unexpected whitespace and punctuation', () => {
  const cases = [
    {
      input: '  “tennis updates”   are   informational  ! ',
      expectedType: 'phrase',
      expectedVal: 'tennis updates',
      expectedArchetype: 'estate_knowledge',
      expectedDir: 'route_archetype',
    },
    {
      input: '‘bakery receipts’ is logistics.',
      expectedType: 'phrase',
      expectedVal: 'bakery receipts',
      expectedArchetype: 'logistics_parcels',
      expectedDir: 'route_archetype',
    },
    {
      input: '«field trip waivers» are action',
      expectedType: 'phrase',
      expectedVal: 'field trip waivers',
      expectedArchetype: 'executive_actions',
      expectedDir: 'route_archetype',
    },
    {
      input: 'stop extracting promotional flyers from jiffy.com!',
      expectedType: 'domain',
      expectedVal: 'jiffy.com',
      expectedArchetype: 'promotional_noise',
      expectedDir: 'suppress',
    },
    {
      input: 'forget the rule about tennis updates',
      expectedType: 'phrase',
      expectedVal: 'tennis updates',
      expectedDir: 'user_untrain',
    },
    {
      input: 'do not extract daily newsletters from target.com',
      expectedType: 'domain',
      expectedVal: 'target.com',
      expectedDir: 'suppress',
    },
    {
      input: 'always alert on billing@fpl.com',
      expectedType: 'sender',
      expectedVal: 'billing@fpl.com',
      expectedArchetype: 'executive_actions',
      expectedDir: 'elevate_action',
    },
  ]

  for (const c of cases) {
    assert.equal(isCaptureRuleDirective(c.input), true, `Failed directive detection on: ${c.input}`)
    const parsed = parseVoiceDirective(c.input)
    assert.ok(parsed, `Failed to parse: ${c.input}`)
    assert.equal(parsed.pattern_type, c.expectedType, `Type mismatch on: ${c.input}`)
    assert.equal(parsed.pattern_value, c.expectedVal, `Value mismatch on: ${c.input}`)
    assert.equal(parsed.rule_directive, c.expectedDir, `Directive mismatch on: ${c.input}`)
    if (c.expectedArchetype) {
      assert.equal(parsed.default_archetype, c.expectedArchetype, `Archetype mismatch on: ${c.input}`)
    }
  }
})

// =========================================================================
// TEST SUITE 2: DETERMINISTIC RULE PRECEDENCE RESOLUTION
// =========================================================================

test('AUDIT-PRECEDENCE-01: Strict 4-tier rule precedence (sender [4] > domain [3] > subject [2] > phrase [1])', () => {
  const rules = [
    { id: 'r-phrase', pattern_type: 'phrase', pattern_value: 'science camp', rule_directive: 'route_archetype', default_archetype: 'estate_knowledge', active: true, confidence: 0.9 },
    { id: 'r-subject', pattern_type: 'subject', pattern_value: 'science camp waiver', rule_directive: 'route_archetype', default_archetype: 'temporal_appointments', active: true, confidence: 0.9 },
    { id: 'r-domain', pattern_type: 'domain', pattern_value: 'palmbeachschools.org', rule_directive: 'suppress', default_archetype: 'promotional_noise', active: true, confidence: 0.9 },
    { id: 'r-sender', pattern_type: 'sender', pattern_value: 'principal@palmbeachschools.org', rule_directive: 'elevate_action', default_archetype: 'executive_actions', active: true, confidence: 0.9 },
  ]

  // Case A: Matches all 4 -> sender wins
  const matchAll = matchCaptureRules(rules, {
    from: 'principal@palmbeachschools.org',
    subject: 'Science Camp Waiver Details',
    body: 'Please complete the science camp registration',
  })
  assert.equal(matchAll.length, 4)
  assert.equal(matchAll[0].id, 'r-sender')

  // Case B: Matches domain, subject, phrase -> domain wins
  const match3 = matchCaptureRules(rules, {
    from: 'teacher@palmbeachschools.org',
    subject: 'Science Camp Waiver Details',
    body: 'Please complete the science camp registration',
  })
  assert.equal(match3.length, 3)
  assert.equal(match3[0].id, 'r-domain')

  // Case C: Matches subject and phrase -> subject wins
  const match2 = matchCaptureRules(rules, {
    from: 'other@external.org',
    subject: 'Science Camp Waiver Details',
    body: 'Please complete the science camp registration',
  })
  assert.equal(match2.length, 2)
  assert.equal(match2[0].id, 'r-subject')

  // Case D: Matches only phrase in body -> phrase matches
  const match1 = matchCaptureRules(rules, {
    from: 'other@external.org',
    subject: 'Important notice',
    body: 'Information regarding science camp next week',
  })
  assert.equal(match1.length, 1)
  assert.equal(match1[0].id, 'r-phrase')
})

// =========================================================================
// TEST SUITE 3: DATE ANCHORING INTEGRITY & COMPLEX TIMING
// =========================================================================

test('AUDIT-DATE-01: Anchoring relative temporal references to email date', () => {
  const sentDate = '2026-08-20T10:00:00.000Z' // Thursday

  // "this Friday" relative to Aug 20 (Thursday) -> Aug 21
  const thisFriday = anchorRelativeDate('this Friday at 3:00 pm', sentDate)
  assert.equal(thisFriday.dateStr, '2026-08-21')
  assert.equal(thisFriday.isAllDay, false)
  assert.ok(thisFriday.isoString.includes('2026-08-21T15:00:00-04:00'))

  // "on Monday" relative to Aug 20 (Thursday) -> Aug 24
  const onMonday = anchorRelativeDate('on Monday at 9:00 am', sentDate)
  assert.equal(onMonday.dateStr, '2026-08-24')
  assert.equal(onMonday.isAllDay, false)

  // "next Monday" relative to Aug 20 (Thursday) -> Aug 31 (+7 days after this Monday)
  const nextMonday = anchorRelativeDate('next Monday at 9:00 am', sentDate)
  assert.equal(nextMonday.dateStr, '2026-08-31')
  assert.equal(nextMonday.isAllDay, false)

  // "in 5 days" relative to Aug 20 -> Aug 25
  const in5Days = anchorRelativeDate('in 5 days', sentDate)
  assert.equal(in5Days.dateStr, '2026-08-25')
  assert.equal(in5Days.isAllDay, true)

  // "tomorrow morning" relative to Aug 20 -> Aug 21 at 09:00
  const tomMorn = anchorRelativeDate('tomorrow morning', sentDate)
  assert.equal(tomMorn.dateStr, '2026-08-21')
  assert.equal(tomMorn.isAllDay, false)
  assert.ok(tomMorn.isoString.includes('2026-08-21T09:00:00'))

  // "tomorrow afternoon" relative to Aug 20 -> Aug 21 at 14:00
  const tomAft = anchorRelativeDate('tomorrow afternoon', sentDate)
  assert.equal(tomAft.dateStr, '2026-08-21')
  assert.equal(tomAft.isAllDay, false)
  assert.ok(tomAft.isoString.includes('2026-08-21T14:00:00'))

  // "tomorrow evening" relative to Aug 20 -> Aug 21 at 19:00
  const tomEve = anchorRelativeDate('tomorrow evening', sentDate)
  assert.equal(tomEve.dateStr, '2026-08-21')
  assert.equal(tomEve.isAllDay, false)
  assert.ok(tomEve.isoString.includes('2026-08-21T19:00:00'))
})

// =========================================================================
// TEST SUITE 4: FEW-SHOT RETRIEVAL & PROMPT INJECTION AUTHENTICITY
// =========================================================================

test('AUDIT-FEWSHOT-01: Scoring discrimination against diverse domains and query intents', () => {
  const seeds = getDefaultGoldenExemplars()
  assert.equal(seeds.length, 14)

  // 1. Apple / Tech query
  const appleQuery = { from: 'order@apple.com', subject: 'Your Apple order W1029384756' }
  const rankedApple = scoreAndRankExemplars(seeds, appleQuery)
  assert.ok(Array.isArray(rankedApple))

  // 2. Exact Amazon query
  const amzQuery = { from: 'auto-confirm@amazon.com', subject: 'Your order has shipped via UPS' }
  const rankedAmz = scoreAndRankExemplars(seeds, amzQuery)
  assert.ok(rankedAmz.length > 0)
  assert.equal(rankedAmz[0].domain, 'amazon.com')

  // 3. FPL Electric bill query
  const fplQuery = { from: 'billing@fpl.com', subject: 'Electric bill payment reminder' }
  const rankedFpl = scoreAndRankExemplars(seeds, fplQuery)
  assert.ok(rankedFpl.length > 0)
  assert.equal(rankedFpl[0].domain, 'fpl.com')
  assert.equal(rankedFpl[0].email_archetype, 'executive_actions')
})

// =========================================================================
// TEST SUITE 5: ZERO NOISE LEAKAGE PARTITIONING
// =========================================================================

test('AUDIT-LEAKAGE-01: Strict noise isolation guarantee', () => {
  const mixedFeed = [
    { id: '1', agency_level: 0, description: 'Amazon package delivery #112-8472910' },
    { id: '2', agency_level: 0, description: 'Jiffy tracking #2541442349 with 30-day return policy' },
    { id: '3', agency_level: 0, description: 'HOA pool maintenance log' },
    { id: '4', agency_level: 0, description: 'Mirasol HOA lawn watering schedule' },
    { id: '5', agency_level: 0, description: 'Promotional discount flyer (50% off sale)' },
    { id: '6', agency_level: 2, description: 'Sign Science Camp permission slip' },
    { id: '7', agency_level: 3, description: 'Pay FPL electric bill $241.18 due Sept 5' },
    { id: '8', agency_level: 1, description: 'RSVP to birthday party' },
  ]

  const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems(mixedFeed)

  assert.equal(actionableItems.length, 3, 'Exactly 3 actionable items (agency_level >= 1)')
  assert.ok(deliveryTransitItems.length >= 1, 'Passive items (agency_level === 0) routed to transit feed')
  assert.ok(actionableItems.every((a) => (a.agency_level ?? 2) >= 1))
})
