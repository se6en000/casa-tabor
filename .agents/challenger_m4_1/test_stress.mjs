// .agents/challenger_m4_1/test_stress.mjs
/**
 * Adversarial Stress-Testing & Fuzzing Harness for Milestone 4
 * Dynamic Few-Shot Exemplar Store & Capture Command Router
 * 
 * Challenger M4-1 empirical test suite reproducing all failure modes and certifying passes.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { performance } from 'node:perf_hooks'

import {
  applyCaptureRules,
  isCaptureRuleDirective,
  matchCaptureRules,
  parseVoiceDirective,
  resolveCaptureCommand,
  synthesizeFeedbackRule,
} from '../../supabase/functions/_shared/capture-command-router.mjs'

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
} from '../../supabase/functions/_shared/few-shot-exemplar-store.mjs'

import {
  anchorRelativeDate,
  decomposeCompoundEmail,
  formatCompoundDecomposerPrompt,
  isCompoundEmail,
  parseCompoundDecomposerResponse,
} from '../../supabase/functions/_shared/compound-decomposer.mjs'

const NOW = new Date('2026-08-23T14:00:00.000Z')
const BASE_OPTIONS = {
  now: NOW,
  utcOffset: '-04:00',
  familyNames: ['Jake', 'Kelly', 'Liv', 'Emme', 'Owen'],
}

// =========================================================================
// SECTION 1: PASSING DOMAIN & EXEMPLAR STRESS SUITES
// =========================================================================

test('PASS: extractDomainFromEmail handles diverse domain structures & malformed emails', () => {
  assert.equal(extractDomainFromEmail('orders@walmart.com'), 'walmart.com')
  assert.equal(extractDomainFromEmail('notify@sub.mail.amazon.co.uk'), 'sub.mail.amazon.co.uk')
  assert.equal(extractDomainFromEmail('"Jacob Tabor" <jacob@taborhoa.org>'), 'taborhoa.org')
  assert.equal(extractDomainFromEmail('https://orders.walmart.com/track'), 'orders.walmart.com')
  assert.equal(extractDomainFromEmail('mailto:alerts@delta.com'), 'delta.com')
  assert.equal(extractDomainFromEmail(null), '')
  assert.equal(extractDomainFromEmail(undefined), '')
  assert.equal(extractDomainFromEmail(''), '')
})

test('PASS: scoreExemplar evaluates multi-factor scoring (domain, sender, archetype, keywords)', () => {
  const exemplar = {
    domain: 'amazon.com',
    sender_pattern: '%auto-confirm@amazon.com%',
    email_archetype: 'logistics_parcels',
    sample_subject: 'Your Amazon order has shipped',
    sample_snippet: 'Your order # 112-8472910-4829103 has shipped via UPS',
    exemplar_weight: 1.5,
  }

  const exactScore = scoreExemplar(exemplar, { domain: 'amazon.com' })
  assert.equal(exactScore, 40 * 1.5)

  const subScore = scoreExemplar(exemplar, { domain: 'ship-notify.amazon.com' })
  assert.equal(subScore, 25 * 1.5)

  const senderScore = scoreExemplar(exemplar, { sender: 'auto-confirm@amazon.com' })
  assert.equal(senderScore, (40 + 30) * 1.5)
})

test('PASS: Jaccard similarity & tokenization under Unicode, emoji, and massive snippets', () => {
  const tokens = tokenizeText('🎾 Tennis tournament at 5pm! 🏆 Sign waiver 📝')
  assert.ok(tokens.has('tennis'))
  assert.ok(tokens.has('tournament'))
  assert.ok(tokens.has('sign'))
  assert.ok(tokens.has('waiver'))

  assert.equal(calculateJaccardSimilarity(new Set(), new Set()), 0)
  assert.equal(calculateJaccardSimilarity(new Set(['a', 'b']), new Set(['a', 'b'])), 1.0)
  assert.equal(calculateJaccardSimilarity(new Set(['a', 'b']), new Set(['a', 'c'])), 1 / 3)

  // 100,000 character stress test
  let massiveText = ''
  const words = ['waiver', 'liability', 'swimming', 'schedule', 'doctor', 'flight', 'arrival', 'grocery']
  for (let i = 0; i < 12500; i++) {
    massiveText += words[i % words.length] + ' '
  }
  const tStart = performance.now()
  const massiveTokens = tokenizeText(massiveText)
  const duration = performance.now() - tStart
  assert.ok(duration < 100, `Tokenization took ${duration.toFixed(2)}ms`)
  assert.ok(massiveTokens.size >= 8)
})

test('PASS: scoreAndRankExemplars under 1,000 exemplar scale and formatFewShotPromptBlock', () => {
  const baseSeeds = getDefaultGoldenExemplars()
  const pool = []
  for (let i = 0; i < 1000; i++) {
    const s = baseSeeds[i % baseSeeds.length]
    pool.push({ ...s, id: `test-${i}`, sample_subject: `${s.sample_subject} #${i}` })
  }
  const tStart = performance.now()
  const ranked = scoreAndRankExemplars(pool, { from: 'help@walmart.com', subject: 'InHome delivery' }, { limit: 2 })
  const duration = performance.now() - tStart
  assert.ok(duration < 50, `Ranking took ${duration.toFixed(2)}ms`)
  assert.equal(ranked.length, 2)
  assert.equal(ranked[0].domain, 'walmart.com')

  const promptBlock = formatFewShotPromptBlock(ranked)
  assert.ok(promptBlock.includes('### REFERENCE GOLDEN EXTRACTION EXEMPLARS:'))
  assert.ok(promptBlock.includes('```json'))
})

test('PASS: matchCaptureRules strict precedence hierarchy (sender [4] > domain [3] > subject [2] > phrase [1])', () => {
  const rules = [
    { id: 'rule-phrase', pattern_type: 'phrase', pattern_value: 'tennis', default_archetype: 'estate_knowledge', active: true },
    { id: 'rule-subject', pattern_type: 'subject', pattern_value: 'tennis practice update', default_archetype: 'temporal_appointments', active: true },
    { id: 'rule-domain', pattern_type: 'domain', pattern_value: 'tennis-academy.com', default_archetype: 'promotional_noise', active: true },
    { id: 'rule-sender', pattern_type: 'sender', pattern_value: 'coach@tennis-academy.com', default_archetype: 'executive_actions', active: true },
  ]

  const candidateAll = {
    from: 'coach@tennis-academy.com',
    subject: 'Tennis Practice Update for Fall',
    body: 'Important tennis instructions here',
  }
  const matched = matchCaptureRules(rules, candidateAll)
  assert.equal(matched.length, 4)
  assert.equal(matched[0].id, 'rule-sender', 'Sender rule MUST take top precedence')
  assert.equal(matched[1].id, 'rule-domain', 'Domain rule MUST take 2nd precedence')
  assert.equal(matched[2].id, 'rule-subject', 'Subject rule MUST take 3rd precedence')
  assert.equal(matched[3].id, 'rule-phrase', 'Phrase rule MUST take lowest precedence')
})

test('PASS: Inactive rules (active: false) are excluded from matching', () => {
  const rules = [
    { id: 'inactive-sender', pattern_type: 'sender', pattern_value: 'coach@tennis-academy.com', active: false },
    { id: 'active-domain', pattern_type: 'domain', pattern_value: 'tennis-academy.com', active: true },
  ]
  const matched = matchCaptureRules(rules, { from: 'coach@tennis-academy.com' })
  assert.equal(matched.length, 1)
  assert.equal(matched[0].id, 'active-domain')
})

test('PASS: resolveCaptureCommand preserves quick actions without collision', () => {
  const grocery = resolveCaptureCommand('Add apples and bananas to the shopping list', BASE_OPTIONS)
  assert.equal(grocery.status, 'execute')
  assert.equal(grocery.tool, 'add_grocery_items')

  const reminder = resolveCaptureCommand('Remind me to pick up meds tomorrow at 9am', BASE_OPTIONS)
  assert.equal(reminder.status, 'execute')
  assert.equal(reminder.tool, 'create_event')

  const event = resolveCaptureCommand('Create dinner with Kelly on 2026-08-25 at 7pm at Avocado Grill', BASE_OPTIONS)
  assert.equal(event.status, 'execute')
  assert.equal(event.tool, 'create_event')
})

// =========================================================================
// SECTION 2: EMPIRICAL DEFECT DEMONSTRATIONS (THE CHALLENGES)
// =========================================================================

test('DEFECT 1: Smart / Unicode quotes corrupt pattern_value extraction in parseVoiceDirective', () => {
  // Input with curly/smart quotes (standard from iOS/macOS voice dictation)
  const input = '“tennis updates” are informational'
  const parsed = parseVoiceDirective(input)
  assert.ok(parsed, 'Directive should parse')
  
  // Demonstrating the bug: cleanPatternValue only strips ASCII ["'] so curly quotes remain in the extracted pattern
  const hasCurlyQuotes = parsed.pattern_value.includes('“') || parsed.pattern_value.includes('”')
  assert.ok(hasCurlyQuotes, 'EMPIRICAL BUG CONFIRMED: Curly quotes were preserved in pattern_value')
  assert.notEqual(parsed.pattern_value, 'tennis updates', 'Failed to normalize smart quotes to clean pattern value')
})

test('DEFECT 2: isCaptureRuleDirective regex misses keywords present in ARCHETYPE_MAP', () => {
  // ARCHETYPE_MAP supports 'knowledge', 'newsletters', 'orders', 'schedule', 'spam'
  const unhandledPhrases = [
    'pool maintenance reports are knowledge',
    'school updates are newsletters',
    'track grocery orders as orders',
    'mark clinic visits as schedule',
    'coupons are spam',
  ]

  for (const phrase of unhandledPhrases) {
    const isDirective = isCaptureRuleDirective(phrase)
    assert.equal(isDirective, false, `EMPIRICAL BUG CONFIRMED: isCaptureRuleDirective returned false for valid directive: "${phrase}"`)
  }
})

test('DEFECT 3: Suppression parser fails when modifiers precede email/newsletter nouns', () => {
  // When an adjective like "weekly" or "promotional" precedes "newsletters from"
  const input = 'do not extract weekly newsletters from target.com'
  const parsed = parseVoiceDirective(input)
  assert.ok(parsed)
  // Expected: 'target.com', Actual: 'weekly target.com'
  assert.equal(parsed.pattern_value, 'weekly target.com', 'EMPIRICAL BUG CONFIRMED: Pattern value was corrupted with leftover modifier "weekly target.com"')
})

test('DEFECT 4: Untrain parser regex fails on "untrain rule for X" due to prefix stripping order', () => {
  const input = 'untrain rule for tennis updates'
  const parsed = parseVoiceDirective(input)
  assert.ok(parsed)
  // Expected: 'tennis updates', Actual: 'rule tennis updates'
  assert.equal(parsed.pattern_value, 'rule tennis updates', 'EMPIRICAL BUG CONFIRMED: Pattern value was corrupted to "rule tennis updates"')
})

test('DEFECT 5: anchorRelativeDate fails to parse time for "tomorrow morning" / "morning" dayparts', () => {
  const sentDate = '2026-08-20T10:00:00.000Z'
  const result = anchorRelativeDate('tomorrow morning', sentDate)
  // Expected: isoString: '2026-08-21T09:00:00-04:00', isAllDay: false
  // Actual: isoString: null, isAllDay: true
  assert.equal(result.isoString, null, 'EMPIRICAL BUG CONFIRMED: isoString is null for "tomorrow morning"')
  assert.equal(result.isAllDay, true, 'EMPIRICAL BUG CONFIRMED: isAllDay defaulted to true for "tomorrow morning"')
})
