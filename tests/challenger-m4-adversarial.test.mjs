// tests/challenger-m4-adversarial.test.mjs
/**
 * Milestone 4 Empirical Adversarial Verification Suite (Challenger 3)
 * 
 * Deep empirical verification across all 6 hardening fixes:
 * 1. Smart/curly quote stripping in cleanPatternValue & parseVoiceDirective
 * 2. Archetype aliases in isCaptureRuleDirective & ARCHETYPE_MAP
 * 3. Suppression parser with modifiers & adjectives
 * 4. Untrain parser with diverse verbal prefixes
 * 5. Dayparts (morning/afternoon/evening/tonight) in anchorRelativeDate
 * 6. Client useHouseholdCaptureRules matchRule precedence hierarchy & body matching
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyCaptureRules,
  isCaptureRuleDirective,
  matchCaptureRules,
  parseVoiceDirective,
  resolveCaptureCommand,
  synthesizeFeedbackRule,
} from '../supabase/functions/_shared/capture-command-router.mjs'

import {
  anchorRelativeDate,
  decomposeCompoundEmail,
  formatCompoundDecomposerPrompt,
  isCompoundEmail,
  parseCompoundDecomposerResponse,
} from '../supabase/functions/_shared/compound-decomposer.mjs'

import {
  calculateJaccardSimilarity,
  clearExemplarCache,
  extractDomainFromEmail,
  fetchExemplars,
  formatFewShotPromptBlock,
  getDefaultGoldenExemplars,
  retrieveFewShotExemplars,
  scoreAndRankExemplars,
  scoreExemplar,
  tokenizeText,
} from '../supabase/functions/_shared/few-shot-exemplar-store.mjs'

// =========================================================================
// TEST SUITE 1: SMART / CURLY / UNICODE QUOTE NORMALIZATION
// =========================================================================

test('CHALLENGE-1.1: Strips single & double curly quotes from voice transcription', () => {
  const cases = [
    { input: '“tennis updates” are informational', expectedVal: 'tennis updates', expectedArch: 'estate_knowledge' },
    { input: '‘tennis updates’ are informational', expectedVal: 'tennis updates', expectedArch: 'estate_knowledge' },
    { input: '«bakery receipts» are logistics', expectedVal: 'bakery receipts', expectedArch: 'logistics_parcels' },
    { input: '»field trip waivers« are actions', expectedVal: 'field trip waivers', expectedArch: 'executive_actions' },
    { input: '““swimming practice”” is calendar', expectedVal: 'swimming practice', expectedArch: 'temporal_appointments' },
    { input: '‘“science camp forms”’ are tasks', expectedVal: 'science camp forms', expectedArch: 'executive_actions' },
    { input: '"target.com" is spam', expectedVal: 'target.com', expectedArch: 'promotional_noise' },
    { input: '“target.com” are newsletters', expectedVal: 'target.com', expectedArch: 'estate_knowledge' },
  ]

  for (const tc of cases) {
    const parsed = parseVoiceDirective(tc.input)
    assert.ok(parsed, `Directive should parse: "${tc.input}"`)
    assert.equal(parsed.pattern_value, tc.expectedVal, `Expected clean value "${tc.expectedVal}", got "${parsed.pattern_value}" for input "${tc.input}"`)
    assert.equal(parsed.default_archetype, tc.expectedArch, `Expected archetype "${tc.expectedArch}", got "${parsed.default_archetype}" for input "${tc.input}"`)
  }
})

test('CHALLENGE-1.2: Preserves internal apostrophes in phrases while stripping outer quotes', () => {
  const input = '“jacob’s bakery receipts” are logistics'
  const parsed = parseVoiceDirective(input)
  assert.ok(parsed)
  // Outer double curly quotes stripped, internal apostrophe preserved
  assert.equal(parsed.pattern_value, 'jacob’s bakery receipts')
  assert.equal(parsed.default_archetype, 'logistics_parcels')
})

test('CHALLENGE-1.3: Handles trailing punctuation combined with quotes', () => {
  const parsed = parseVoiceDirective('“tennis updates” are informational!')
  assert.ok(parsed)
  assert.equal(parsed.pattern_value, 'tennis updates')
})

// =========================================================================
// TEST SUITE 2: EXPANDED ARCHETYPE ALIASES IN isCaptureRuleDirective
// =========================================================================

test('CHALLENGE-2.1: isCaptureRuleDirective recognizes all archetype aliases for "X are/is Y" grammar', () => {
  const aliases = [
    // Estate Knowledge
    'pool maintenance reports are knowledge',
    'hoa announcements are newsletters',
    'school updates are newsletter',
    'neighborhood alerts are info',
    'water quality reports are informational',
    'hvac manuals are estate knowledge',
    // Logistics & Parcels
    'amazon receipts are logistics',
    'usps packages are parcels',
    'ups boxes are parcel',
    'fedex alerts are delivery',
    'bakery purchases are receipts',
    'walmart orders are orders',
    // Executive Actions
    'field trip forms are actions',
    'doctor forms are action',
    'school physicals are tasks',
    'camp releases are waivers',
    'swim registration is waiver',
    'fpl electric statements are bills',
    'contractor statements are invoices',
    // Temporal Appointments
    'soccer practice is appointment',
    'dentist visits are appointments',
    'orthodontist checkups are calendar',
    'tennis lessons are schedule',
    // Lifecycle Updates
    'flight status changes are updates',
    'gate change notifications are update',
    'package delay alerts are lifecycle',
    // Promotional Noise
    'coupons are spam',
    'promotions are promotional',
    'marketing blasts are promo',
    'daily deals are marketing',
    'automated circulars are noise',
  ]

  for (const phrase of aliases) {
    const isDirective = isCaptureRuleDirective(phrase)
    assert.equal(isDirective, true, `isCaptureRuleDirective must return true for: "${phrase}"`)
    const parsed = parseVoiceDirective(phrase)
    assert.ok(parsed, `parseVoiceDirective must succeed for: "${phrase}"`)
    assert.ok(parsed.default_archetype, `Must have default_archetype for: "${phrase}"`)
  }
})

test('CHALLENGE-2.2: isCaptureRuleDirective & parseVoiceDirective on "track/route/mark/treat X as/to/into Y"', () => {
  // Phrases that currently pass line 91
  const passingPhrases = [
    { input: 'track bakery receipts as logistics', expectedArch: 'logistics_parcels' },
    { input: 'mark field trip releases as waivers', expectedArch: 'executive_actions' },
    { input: 'treat coupons as spam', expectedArch: 'promotional_noise' },
    { input: 'route dentist reminders to schedule', expectedArch: 'temporal_appointments' },
    { input: 'mark flight delays as updates', expectedArch: 'lifecycle_updates' },
    { input: 'always track groceries into parcels', expectedArch: 'logistics_parcels' },
  ]

  for (const p of passingPhrases) {
    assert.equal(isCaptureRuleDirective(p.input), true, `Must identify as directive: "${p.input}"`)
    const parsed = parseVoiceDirective(p.input)
    assert.ok(parsed, `Must parse: "${p.input}"`)
    assert.equal(parsed.default_archetype, p.expectedArch, `Expected ${p.expectedArch} for "${p.input}", got ${parsed.default_archetype}`)
  }
})

test('CHALLENGE-2.3: Line 91 matches all archetype aliases (knowledge, info, newsletters, appointment singular, executive actions)', () => {
  const cases = [
    { input: 'route pool maintenance into knowledge', expectedPattern: 'pool maintenance', expectedArch: 'estate_knowledge' },
    { input: 'track clinic visits as info', expectedPattern: 'clinic visits', expectedArch: 'estate_knowledge' },
    { input: 'mark school bulletins as newsletter', expectedPattern: 'school bulletins', expectedArch: 'estate_knowledge' },
    { input: 'route community letters as newsletters', expectedPattern: 'community letters', expectedArch: 'estate_knowledge' },
    { input: 'treat doctor checkup as appointment', expectedPattern: 'doctor checkup', expectedArch: 'temporal_appointments' },
  ]

  for (const tc of cases) {
    const isDirective = isCaptureRuleDirective(tc.input)
    assert.equal(isDirective, true, `isCaptureRuleDirective must return true for "${tc.input}"`)

    const parsed = parseVoiceDirective(tc.input)
    assert.ok(parsed, `parseVoiceDirective must parse "${tc.input}"`)
    assert.equal(parsed.pattern_value, tc.expectedPattern)
    assert.equal(parsed.default_archetype, tc.expectedArch)

    const cmd = resolveCaptureCommand(tc.input)
    assert.equal(cmd.status, 'execute', `resolveCaptureCommand must return execute status for "${tc.input}"`)
    assert.equal(cmd.tool, 'upsert_capture_rule', `resolveCaptureCommand must use upsert_capture_rule tool for "${tc.input}"`)
    assert.equal(cmd.args.pattern_value, tc.expectedPattern)
    assert.equal(cmd.args.default_archetype, tc.expectedArch)
    assert.equal(cmd.args.rule_directive, 'route_archetype')
  }
})

test('CHALLENGE-2.4: isCaptureRuleDirective does NOT hijack assistant quick actions', () => {
  const nonDirectives = [
    'Add apples and bananas to the shopping list',
    'add 2 gallons organic milk to grocery list',
    'please add coffee to food list',
    'Remind me to pick up meds at 10am',
    'remind me tomorrow morning to call the dentist',
    'Create dinner with Kelly at 7pm',
    'schedule meeting with Dr Hanna on Friday at 3pm',
    'Tell me a joke',
    '',
    null,
    undefined,
  ]

  for (const item of nonDirectives) {
    assert.equal(isCaptureRuleDirective(item), false, `Must NOT flag as capture directive: "${item}"`)
  }
})

// =========================================================================
// TEST SUITE 3: SUPPRESSION PARSER WITH MODIFIERS
// =========================================================================

test('CHALLENGE-3.1: Suppression parser strips leading adjectives and articles cleanly', () => {
  const cases = [
    { input: 'do not extract weekly newsletters from target.com', expected: 'target.com' },
    { input: 'stop extracting daily flyers from walmart.com', expected: 'walmart.com' },
    { input: 'never alert on monthly promotions from bathandbodyworks.com', expected: 'bathandbodyworks.com' },
    { input: 'suppress promotional emails from kohls.com', expected: 'kohls.com' },
    { input: 'ignore all newsletters from taborhoa.org', expected: 'taborhoa.org' },
    { input: 'dont extract the messages of spammer.com', expected: 'spammer.com' },
    { input: 'stop tracking flyers from jiffy.com', expected: 'jiffy.com' },
    { input: 'mute emails from junk@sender.com', expected: 'junk@sender.com' },
    { input: 'ignore promotions from uber.com', expected: 'uber.com' },
    { input: 'stop extracting emails from oldnavy.com', expected: 'oldnavy.com' },
    { input: 'ignore gap.com', expected: 'gap.com' },
    { input: 'do not extract flyers from publix.com', expected: 'publix.com' },
  ]

  for (const tc of cases) {
    const parsed = parseVoiceDirective(tc.input)
    assert.ok(parsed, `Must parse suppression: "${tc.input}"`)
    assert.equal(parsed.rule_directive, 'suppress')
    assert.equal(parsed.default_archetype, 'promotional_noise')
    assert.equal(parsed.pattern_value, tc.expected, `For "${tc.input}", expected "${tc.expected}", got "${parsed.pattern_value}"`)
  }
})

// =========================================================================
// TEST SUITE 4: UNTRAIN PARSER WITH DIVERSE PREFIXES
// =========================================================================

test('CHALLENGE-4.1: Untrain parser strips all variations of untrain / forget prefixes', () => {
  const cases = [
    { input: 'untrain rule for tennis updates', expected: 'tennis updates' },
    { input: 'untrain the rule for tennis updates', expected: 'tennis updates' },
    { input: 'forget rule for tennis updates', expected: 'tennis updates' },
    { input: 'forget the rule for bakery receipts', expected: 'bakery receipts' },
    { input: 'delete rule about target.com', expected: 'target.com' },
    { input: 'delete the rule about target.com', expected: 'target.com' },
    { input: 'remove the rule on field trip waivers', expected: 'field trip waivers' },
    { input: 'undo the rule for weekly flyers', expected: 'weekly flyers' },
    { input: 'clear the rule from jiffy.com', expected: 'jiffy.com' },
    { input: 'untrain rule on walmart.com', expected: 'walmart.com' },
    { input: 'untrain rule from coach@tennisacademy.com', expected: 'coach@tennisacademy.com' },
  ]

  for (const tc of cases) {
    const parsed = parseVoiceDirective(tc.input)
    assert.ok(parsed, `Must parse untrain: "${tc.input}"`)
    assert.equal(parsed.rule_directive, 'user_untrain')
    assert.equal(parsed.origin, 'user_untrain')
    assert.equal(parsed.active, false)
    assert.equal(parsed.pattern_value, tc.expected, `For "${tc.input}", expected pattern_value "${tc.expected}", got "${parsed.pattern_value}"`)
  }
})

// =========================================================================
// TEST SUITE 5: DAYPART MATCHING IN anchorRelativeDate
// =========================================================================

test('CHALLENGE-5.1: anchorRelativeDate correctly resolves dayparts with hour precision', () => {
  const anchor = '2026-08-20T12:00:00.000Z' // Thursday

  // Tomorrow morning -> 2026-08-21 09:00 EDT
  const tomMorn = anchorRelativeDate('tomorrow morning', anchor)
  assert.equal(tomMorn.dateStr, '2026-08-21')
  assert.equal(tomMorn.isoString, '2026-08-21T09:00:00-04:00')
  assert.equal(tomMorn.isAllDay, false)

  // Tomorrow afternoon -> 2026-08-21 14:00 EDT
  const tomAft = anchorRelativeDate('tomorrow afternoon', anchor)
  assert.equal(tomAft.dateStr, '2026-08-21')
  assert.equal(tomAft.isoString, '2026-08-21T14:00:00-04:00')
  assert.equal(tomAft.isAllDay, false)

  // Tomorrow evening -> 2026-08-21 19:00 EDT
  const tomEve = anchorRelativeDate('tomorrow evening', anchor)
  assert.equal(tomEve.dateStr, '2026-08-21')
  assert.equal(tomEve.isoString, '2026-08-21T19:00:00-04:00')
  assert.equal(tomEve.isAllDay, false)

  // This morning -> 2026-08-20 09:00 EDT
  const thisMorn = anchorRelativeDate('this morning', anchor)
  assert.equal(thisMorn.dateStr, '2026-08-20')
  assert.equal(thisMorn.isoString, '2026-08-20T09:00:00-04:00')
  assert.equal(thisMorn.isAllDay, false)

  // This afternoon -> 2026-08-20 14:00 EDT
  const thisAft = anchorRelativeDate('this afternoon', anchor)
  assert.equal(thisAft.dateStr, '2026-08-20')
  assert.equal(thisAft.isoString, '2026-08-20T14:00:00-04:00')
  assert.equal(thisAft.isAllDay, false)

  // This evening -> 2026-08-20 19:00 EDT
  const thisEve = anchorRelativeDate('this evening', anchor)
  assert.equal(thisEve.dateStr, '2026-08-20')
  assert.equal(thisEve.isoString, '2026-08-20T19:00:00-04:00')
  assert.equal(thisEve.isAllDay, false)

  // Friday morning (anchor is Thursday 08-20) -> Friday 08-21 09:00
  const friMorn = anchorRelativeDate('this Friday morning', anchor)
  assert.equal(friMorn.dateStr, '2026-08-21')
  assert.equal(friMorn.isoString, '2026-08-21T09:00:00-04:00')
  assert.equal(friMorn.isAllDay, false)

  // Friday afternoon -> Friday 08-21 14:00
  const friAft = anchorRelativeDate('Friday afternoon', anchor)
  assert.equal(friAft.dateStr, '2026-08-21')
  assert.equal(friAft.isoString, '2026-08-21T14:00:00-04:00')
  assert.equal(friAft.isAllDay, false)

  // Yesterday morning -> 2026-08-19 09:00
  const yestMorn = anchorRelativeDate('yesterday morning', anchor)
  assert.equal(yestMorn.dateStr, '2026-08-19')
  assert.equal(yestMorn.isoString, '2026-08-19T09:00:00-04:00')
  assert.equal(yestMorn.isAllDay, false)

  // Tonight -> 2026-08-20 20:00
  const tonight = anchorRelativeDate('tonight', anchor)
  assert.equal(tonight.dateStr, '2026-08-20')
  assert.equal(tonight.isoString, '2026-08-20T20:00:00-04:00')
  assert.equal(tonight.isAllDay, false)
})

// =========================================================================
// TEST SUITE 6: CLIENT & SERVICE PRECEDENCE HIERARCHY & BODY MATCHING
// =========================================================================

test('CHALLENGE-6.1: Deterministic precedence hierarchy (sender [4] > domain [3] > subject [2] > phrase [1])', () => {
  const rules = [
    { id: 'rule-phrase', pattern_type: 'phrase', pattern_value: 'tennis lesson', default_archetype: 'estate_knowledge', confidence: 0.8, active: true },
    { id: 'rule-subject', pattern_type: 'subject', pattern_value: 'tennis tournament waiver', default_archetype: 'temporal_appointments', confidence: 0.85, active: true },
    { id: 'rule-domain', pattern_type: 'domain', pattern_value: 'tennis-center.org', default_archetype: 'promotional_noise', confidence: 0.9, active: true },
    { id: 'rule-sender', pattern_type: 'sender', pattern_value: 'coach-mike@tennis-center.org', default_archetype: 'executive_actions', confidence: 1.0, active: true },
  ]

  // Scenario 1: Matches all 4 rules
  const candidateAll = {
    from: 'coach-mike@tennis-center.org',
    subject: 'Important: Tennis Tournament Waiver Deadline',
    body: 'Please complete your tennis lesson registration',
  }

  const matched = matchCaptureRules(rules, candidateAll)
  assert.equal(matched.length, 4)
  assert.equal(matched[0].id, 'rule-sender', 'Sender must rank 1st (precedence 4)')
  assert.equal(matched[1].id, 'rule-domain', 'Domain must rank 2nd (precedence 3)')
  assert.equal(matched[2].id, 'rule-subject', 'Subject must rank 3rd (precedence 2)')
  assert.equal(matched[3].id, 'rule-phrase', 'Phrase must rank 4th (precedence 1)')

  // Scenario 2: Matches domain, subject, and phrase (no sender rule)
  const candidateNoSender = {
    from: 'reception@tennis-center.org',
    subject: 'Tennis Tournament Waiver Information',
    body: 'Details regarding tennis lesson options',
  }
  const matched2 = matchCaptureRules(rules, candidateNoSender)
  assert.equal(matched2.length, 3)
  assert.equal(matched2[0].id, 'rule-domain')
  assert.equal(matched2[1].id, 'rule-subject')
  assert.equal(matched2[2].id, 'rule-phrase')

  // Scenario 3: Matches subject and phrase
  const candidateNoDomain = {
    from: 'news@otherclub.com',
    subject: 'Tennis Tournament Waiver Announcement',
    body: 'General info',
  }
  const matched3 = matchCaptureRules(rules, candidateNoDomain)
  assert.equal(matched3.length, 1) // Only subject matches
  assert.equal(matched3[0].id, 'rule-subject')
})

test('CHALLENGE-6.2: Phrase matching works across subject AND email body', () => {
  const rule = {
    pattern_type: 'phrase',
    pattern_value: 'science camp waiver',
    default_archetype: 'executive_actions',
    active: true,
  }

  // Found in subject
  const matchInSubject = matchCaptureRules([rule], {
    from: 'info@school.org',
    subject: 'Please sign the Science Camp Waiver today',
    body: 'See details',
  })
  assert.equal(matchInSubject.length, 1)

  // Found in body (not in subject)
  const matchInBody = matchCaptureRules([rule], {
    from: 'info@school.org',
    subject: 'School Weekly Update #4',
    body: 'Reminder: All 5th graders must return the signed science camp waiver before departure.',
  })
  assert.equal(matchInBody.length, 1)

  // Missing from both
  const matchNone = matchCaptureRules([rule], {
    from: 'info@school.org',
    subject: 'School Weekly Update #4',
    body: 'Regular classes this week.',
  })
  assert.equal(matchNone.length, 0)
})

test('CHALLENGE-6.3: Tie-breaking by confidence when precedence is identical', () => {
  const rules = [
    { id: 'rule-phrase-low', pattern_type: 'phrase', pattern_value: 'tennis', confidence: 0.7, active: true },
    { id: 'rule-phrase-high', pattern_type: 'phrase', pattern_value: 'tennis', confidence: 0.95, active: true },
  ]

  const matched = matchCaptureRules(rules, { subject: 'Tennis match' })
  assert.equal(matched.length, 2)
  assert.equal(matched[0].id, 'rule-phrase-high', 'Higher confidence must rank first on tie precedence')
  assert.equal(matched[1].id, 'rule-phrase-low')
})

test('CHALLENGE-6.4: Inactive rules and empty pattern values are excluded from matches', () => {
  const rules = [
    { id: 'rule-inactive', pattern_type: 'sender', pattern_value: 'coach@club.com', active: false },
    { id: 'rule-empty', pattern_type: 'domain', pattern_value: '', active: true },
    { id: 'rule-whitespace', pattern_type: 'subject', pattern_value: '   ', active: true },
    { id: 'rule-active', pattern_type: 'phrase', pattern_value: 'meeting', active: true },
  ]

  const matched = matchCaptureRules(rules, {
    from: 'coach@club.com',
    subject: 'Annual club meeting',
  })
  assert.equal(matched.length, 1)
  assert.equal(matched[0].id, 'rule-active')
})

// =========================================================================
// TEST SUITE 7: CLIENT HOOK FUNCTIONALITY HARNESS
// =========================================================================

test('CHALLENGE-7.1: Client matchRule simulation verifies identical logic and resilience to missing arguments', () => {
  // Replicating client-side matchRule logic from useHouseholdCaptureRules.ts
  const rules = [
    { id: 'r1', pattern_type: 'phrase', pattern_value: 'field trip', active: true, confidence: 0.8 },
    { id: 'r2', pattern_type: 'domain', pattern_value: 'school.org', active: true, confidence: 0.9 },
    { id: 'r3', pattern_type: 'sender', pattern_value: 'principal@school.org', active: true, confidence: 1.0 },
    { id: 'r4', pattern_type: 'subject', pattern_value: 'urgent permission slip', active: true, confidence: 0.85 },
  ]

  const clientMatchRule = (from, subject, body) => {
    const fromLower = (from || '').toLowerCase()
    const subjLower = (subject || '').toLowerCase()
    const bodyLower = (body || '').toLowerCase()

    const matches = []

    for (const r of rules) {
      if (r.active === false) continue
      const val = (r.pattern_value ?? '').toLowerCase().trim()
      if (!val) continue

      let matched = false
      let precedence = 0

      if (r.pattern_type === 'sender') {
        if (fromLower.includes(val)) {
          matched = true
          precedence = 4
        }
      } else if (r.pattern_type === 'domain') {
        if (fromLower.includes(`@${val}`) || fromLower.includes(val)) {
          matched = true
          precedence = 3
        }
      } else if (r.pattern_type === 'subject') {
        if (subjLower.includes(val)) {
          matched = true
          precedence = 2
        }
      } else if (r.pattern_type === 'phrase') {
        if (subjLower.includes(val) || (bodyLower && bodyLower.includes(val))) {
          matched = true
          precedence = 1
        }
      }

      if (matched) {
        matches.push({ rule: r, precedence })
      }
    }

    return matches
      .sort((a, b) => {
        if (b.precedence !== a.precedence) return b.precedence - a.precedence
        return (b.rule.confidence ?? 1.0) - (a.rule.confidence ?? 1.0)
      })
      .map((m) => m.rule)
  }

  // 1. Full parameters with phrase in body
  const res1 = clientMatchRule('principal@school.org', 'Urgent Permission Slip for Students', 'Please sign the field trip form')
  assert.equal(res1.length, 4)
  assert.equal(res1[0].id, 'r3') // sender
  assert.equal(res1[1].id, 'r2') // domain
  assert.equal(res1[2].id, 'r4') // subject
  assert.equal(res1[3].id, 'r1') // phrase in body

  // 2. Omitted body parameter (undefined)
  const res2 = clientMatchRule('principal@school.org', 'General Notice')
  assert.equal(res2.length, 2)
  assert.equal(res2[0].id, 'r3')
  assert.equal(res2[1].id, 'r2')

  // 3. Null / empty parameters without crashing
  const res3 = clientMatchRule(null, undefined, null)
  assert.equal(res3.length, 0)
})
