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

const NOW = new Date('2026-08-23T14:00:00.000Z')
const OPTIONS = {
  now: NOW,
  utcOffset: '-04:00',
  familyNames: ['Jake', 'Kelly', 'Liv', 'Emme', 'Owen'],
}

// =========================================================================
// SECTION 1: DYNAMIC FEW-SHOT EXEMPLAR STORE
// =========================================================================

test('few-shot store: extractDomainFromEmail parses standard emails and domain strings', () => {
  assert.equal(extractDomainFromEmail('orders@walmart.com'), 'walmart.com')
  assert.equal(extractDomainFromEmail('Principal <principal@palmbeachschools.org>'), 'palmbeachschools.org')
  assert.equal(extractDomainFromEmail('amazon.com'), 'amazon.com')
  assert.equal(extractDomainFromEmail(''), '')
})

test('few-shot store: tokenization and Jaccard similarity', () => {
  const tokensA = tokenizeText('Thanks for your Walmart InHome delivery order')
  const tokensB = tokenizeText('Walmart InHome delivery order confirmed')
  const similarity = calculateJaccardSimilarity(tokensA, tokensB)
  assert.ok(similarity > 0.4, `Jaccard similarity should be high, got ${similarity}`)

  const emptySimilarity = calculateJaccardSimilarity(new Set(), tokensB)
  assert.equal(emptySimilarity, 0)
})

test('few-shot store: scoreExemplar evaluates domain, sender, archetype, and snippet matches', () => {
  const exemplar = {
    domain: 'walmart.com',
    sender_pattern: '%help@walmart.com%',
    email_archetype: 'logistics_parcels',
    sample_subject: 'Thanks for your InHome delivery order, Jacob',
    sample_snippet: 'Your Walmart InHome grocery order is scheduled for delivery tomorrow',
    exemplar_weight: 1.5,
  }

  // Exact domain match
  const scoreExact = scoreExemplar(exemplar, {
    from: 'help@walmart.com',
    subject: 'Thanks for your InHome delivery order',
    archetype: 'logistics_parcels',
    body: 'grocery inhome delivery tomorrow',
  })
  assert.ok(scoreExact > 100, `Expected score > 100, got ${scoreExact}`)

  // Subdomain match
  const scoreSubdomain = scoreExemplar(exemplar, {
    from: 'notify@grocery.walmart.com',
    subject: 'Order updates',
  })
  assert.ok(scoreSubdomain > 30, `Expected subdomain score > 30, got ${scoreSubdomain}`)

  // Unrelated domain
  const scoreUnrelated = scoreExemplar(exemplar, {
    from: 'news@morningbrew.com',
    subject: 'Tech market roundup',
  })
  assert.ok(scoreUnrelated < scoreExact, 'Unrelated query must score substantially lower')
})

test('few-shot store: scoreAndRankExemplars ranks candidates and enforces subject diversity', () => {
  const exemplars = getDefaultGoldenExemplars()
  assert.equal(exemplars.length, 14, 'Must have 14 golden seeds')

  // Querying for Walmart grocery
  const rankedWalmart = scoreAndRankExemplars(exemplars, {
    from: 'help@walmart.com',
    subject: 'InHome delivery update',
  }, { limit: 2 })

  assert.ok(rankedWalmart.length >= 1)
  assert.equal(rankedWalmart[0].domain, 'walmart.com')

  // Querying for School waiver
  const rankedSchool = scoreAndRankExemplars(exemplars, {
    from: 'principal@palmbeachschools.org',
    subject: 'Science camp waiver form',
  }, { limit: 2 })

  assert.ok(rankedSchool.length >= 1)
  assert.equal(rankedSchool[0].domain, 'palmbeachschools.org')
})

test('few-shot store: formatFewShotPromptBlock formats valid markdown prompt section', () => {
  const exemplars = [
    {
      domain: 'palmbeachschools.org',
      email_archetype: 'executive_actions',
      sample_subject: 'Sign Camp Waiver',
      sample_snippet: 'Please sign and return the liability waiver',
      extracted_output: {
        actions: [{ title: 'Sign Camp Waiver', priority: 2 }],
      },
    },
  ]

  const formatted = formatFewShotPromptBlock(exemplars)
  assert.ok(formatted.includes('### REFERENCE GOLDEN EXTRACTION EXEMPLARS:'))
  assert.ok(formatted.includes('Domain: palmbeachschools.org'))
  assert.ok(formatted.includes('Sign Camp Waiver'))
  assert.ok(formatted.includes('```json'))

  const emptyFormatted = formatFewShotPromptBlock([])
  assert.equal(emptyFormatted, '')
})

test('few-shot store: retrieveFewShotExemplars falls back to golden seeds when db offline', async () => {
  clearExemplarCache()
  const results = await retrieveFewShotExemplars(null, {
    from: 'delivery@hellofresh.com',
    subject: 'Weekly meal kit box shipped',
  })
  assert.ok(results.length > 0)
  assert.equal(results[0].domain, 'hellofresh.com')
})

// =========================================================================
// SECTION 2: VOICE DIRECTIVE PARSING & ACTIVE RULE SYNTHESIS
// =========================================================================

test('voice directive: parses informational directive into estate_knowledge', () => {
  const result = parseVoiceDirective('tennis updates are informational')
  assert.ok(result)
  assert.equal(result.pattern_type, 'phrase')
  assert.equal(result.pattern_value, 'tennis updates')
  assert.equal(result.rule_directive, 'route_archetype')
  assert.equal(result.default_archetype, 'estate_knowledge')
  assert.equal(result.origin, 'voice_directive')
  assert.equal(result.active, true)
})

test('voice directive: parses logistics directive into logistics_parcels', () => {
  const result = parseVoiceDirective('always track bakery receipts as logistics')
  assert.ok(result)
  assert.equal(result.pattern_type, 'phrase')
  assert.equal(result.pattern_value, 'bakery receipts')
  assert.equal(result.rule_directive, 'route_archetype')
  assert.equal(result.default_archetype, 'logistics_parcels')
  assert.equal(result.origin, 'voice_directive')
})

test('voice directive: parses action elevation into executive_actions', () => {
  const result = parseVoiceDirective('only alert on field trip waivers')
  assert.ok(result)
  assert.equal(result.pattern_type, 'phrase')
  assert.equal(result.pattern_value, 'field trip waivers')
  assert.equal(result.rule_directive, 'elevate_action')
  assert.equal(result.default_archetype, 'executive_actions')
})

test('voice directive: parses suppression into promotional_noise', () => {
  const result = parseVoiceDirective('stop extracting flyers from jiffy.com')
  assert.ok(result)
  assert.equal(result.pattern_type, 'domain')
  assert.equal(result.pattern_value, 'jiffy.com')
  assert.equal(result.rule_directive, 'suppress')
  assert.equal(result.default_archetype, 'promotional_noise')
})

test('voice directive: parses untrain / rule deletion', () => {
  const result = parseVoiceDirective('forget rule for tennis updates')
  assert.ok(result)
  assert.equal(result.pattern_value, 'tennis updates')
  assert.equal(result.rule_directive, 'user_untrain')
  assert.equal(result.active, false)

  const untrainRule = parseVoiceDirective('untrain rule for tennis updates')
  assert.ok(untrainRule)
  assert.equal(untrainRule.pattern_value, 'tennis updates')
  assert.equal(untrainRule.rule_directive, 'user_untrain')

  const untrainTheRule = parseVoiceDirective('forget the rule for bakery receipts')
  assert.ok(untrainTheRule)
  assert.equal(untrainTheRule.pattern_value, 'bakery receipts')
})

test('voice directive: strips Unicode and smart/curly quotes cleanly', () => {
  const doubleSmart = parseVoiceDirective('“tennis updates” are informational')
  assert.ok(doubleSmart)
  assert.equal(doubleSmart.pattern_value, 'tennis updates')

  const singleSmart = parseVoiceDirective('‘tennis updates’ are informational')
  assert.ok(singleSmart)
  assert.equal(singleSmart.pattern_value, 'tennis updates')

  const guillemets = parseVoiceDirective('«tennis updates» are informational')
  assert.ok(guillemets)
  assert.equal(guillemets.pattern_value, 'tennis updates')
})

test('voice directive: suppression parser cleans leading adjectives and articles', () => {
  const weekly = parseVoiceDirective('do not extract weekly newsletters from target.com')
  assert.ok(weekly)
  assert.equal(weekly.pattern_value, 'target.com')
  assert.equal(weekly.rule_directive, 'suppress')

  const daily = parseVoiceDirective('stop extracting daily flyers from walmart.com')
  assert.ok(daily)
  assert.equal(daily.pattern_value, 'walmart.com')
  assert.equal(daily.rule_directive, 'suppress')
})

test('voice directive: isCaptureRuleDirective distinguishes directives from quick actions', () => {
  assert.equal(isCaptureRuleDirective('tennis updates are informational'), true)
  assert.equal(isCaptureRuleDirective('stop extracting flyers from jiffy.com'), true)
  assert.equal(isCaptureRuleDirective('untrain rule for tennis updates'), true)
  assert.equal(isCaptureRuleDirective('pool maintenance reports are knowledge'), true)
  assert.equal(isCaptureRuleDirective('school updates are newsletters'), true)
  assert.equal(isCaptureRuleDirective('track grocery orders as orders'), true)
  assert.equal(isCaptureRuleDirective('mark clinic visits as schedule'), true)
  assert.equal(isCaptureRuleDirective('coupons are spam'), true)
  assert.equal(isCaptureRuleDirective('Add apples and bananas to the shopping list'), false)
  assert.equal(isCaptureRuleDirective('Remind me to pick up meds at 10am'), false)
  assert.equal(isCaptureRuleDirective('Create dinner with Kelly at 7pm'), false)
  assert.equal(isCaptureRuleDirective(''), false)
})

test('rule synthesis: synthesizeFeedbackRule creates fast dismissal suppression rule', () => {
  const rule = synthesizeFeedbackRule({
    item: { domain: 'marketing.store.com', from_email: 'promo@marketing.store.com', subject: 'Huge 50% Off Sale' },
    action: 'fast_dismissal',
  })

  assert.equal(rule.pattern_type, 'domain')
  assert.equal(rule.pattern_value, 'marketing.store.com')
  assert.equal(rule.rule_directive, 'suppress')
  assert.equal(rule.default_archetype, 'promotional_noise')
  assert.equal(rule.origin, 'fast_dismissal')
})

test('rule synthesis: synthesizeFeedbackRule creates manual category adjustment rule', () => {
  const rule = synthesizeFeedbackRule({
    item: { from_email: 'coach@jupiterunitedsoccer.com', subject: 'Practice Times' },
    action: 'category_adjustment',
    newArchetype: 'temporal_appointments',
  })

  assert.equal(rule.pattern_type, 'domain')
  assert.equal(rule.pattern_value, 'jupiterunitedsoccer.com')
  assert.equal(rule.rule_directive, 'route_archetype')
  assert.equal(rule.default_archetype, 'temporal_appointments')
  assert.equal(rule.origin, 'manual_teach')
})

// =========================================================================
// SECTION 3: RULE MATCHING PRECEDENCE & APPLICATION
// =========================================================================

test('matchCaptureRules: enforces sender > domain > subject > phrase precedence hierarchy', () => {
  const rules = [
    { pattern_type: 'phrase', pattern_value: 'tennis', rule_directive: 'route_archetype', default_archetype: 'estate_knowledge', active: true },
    { pattern_type: 'domain', pattern_value: 'tennis-academy.com', rule_directive: 'suppress', default_archetype: 'promotional_noise', active: true },
    { pattern_type: 'sender', pattern_value: 'coach@tennis-academy.com', rule_directive: 'elevate_action', default_archetype: 'executive_actions', active: true },
  ]

  const candidate = {
    from: 'coach@tennis-academy.com',
    subject: 'Tennis Practice Schedule Updates',
    body: 'Please see tennis schedule below',
  }

  const matched = matchCaptureRules(rules, candidate)
  assert.equal(matched.length, 3, 'All 3 rules match candidate attributes')
  assert.equal(matched[0].pattern_type, 'sender', 'Sender rule MUST take highest precedence')
  assert.equal(matched[0].default_archetype, 'executive_actions')
  assert.equal(matched[1].pattern_type, 'domain', 'Domain rule MUST take 2nd precedence')
  assert.equal(matched[2].pattern_type, 'phrase', 'Phrase rule MUST take lowest precedence')
})

test('applyCaptureRules: modifies candidate email intent and sets agency_level: 0 for passive rules', () => {
  const rules = [
    {
      pattern_type: 'phrase',
      pattern_value: 'bakery receipts',
      rule_directive: 'route_archetype',
      default_archetype: 'logistics_parcels',
      active: true,
    },
  ]

  const candidate = {
    subject: 'Your bakery receipts for Saturday morning pickup',
    from: 'orders@localbakery.com',
    agency_level: 2,
  }

  const { candidate: modified, appliedRule } = applyCaptureRules(candidate, rules)
  assert.ok(appliedRule, 'Must apply rule')
  assert.equal(modified.archetype, 'logistics_parcels')
  assert.equal(modified.agency_level, 0, 'Logistics routing must enforce agency_level = 0 to prevent queue leakage')
})

test('applyCaptureRules: handles suppression and elevates action', () => {
  const suppressRule = [
    {
      pattern_type: 'domain',
      pattern_value: 'jiffy.com',
      rule_directive: 'suppress',
      default_archetype: 'promotional_noise',
      active: true,
    },
  ]

  const { candidate: suppressed } = applyCaptureRules({ from: 'news@jiffy.com', subject: 'Flyers' }, suppressRule)
  assert.equal(suppressed.intent, 'skip')
  assert.equal(suppressed.agency_level, 0)
  assert.equal(suppressed.archetype, 'promotional_noise')

  const elevateRule = [
    {
      pattern_type: 'phrase',
      pattern_value: 'field trip waiver',
      rule_directive: 'elevate_action',
      default_archetype: 'executive_actions',
      active: true,
    },
  ]

  const { candidate: elevated } = applyCaptureRules({ subject: 'Please sign field trip waiver' }, elevateRule)
  assert.equal(elevated.archetype, 'executive_actions')
  assert.equal(elevated.agency_level, 2)
})

// =========================================================================
// SECTION 4: UNIFIED COMMAND ROUTER & ASSISTANT REGRESSION SAFETY
// =========================================================================

test('resolveCaptureCommand: executes voice directive upsert_capture_rule tool', () => {
  const cmd = resolveCaptureCommand('tennis updates are informational', OPTIONS)
  assert.equal(cmd.status, 'execute')
  assert.equal(cmd.tool, 'upsert_capture_rule')
  assert.equal(cmd.args.default_archetype, 'estate_knowledge')
})

test('resolveCaptureCommand: preserves grocery add backward compatibility', () => {
  const cmd = resolveCaptureCommand('Add apples, bananas, and 2 avocados to the shopping list', OPTIONS)
  assert.equal(cmd.status, 'execute')
  assert.equal(cmd.tool, 'add_grocery_items')
  assert.equal(cmd.args.items.length, 3)
})

test('resolveCaptureCommand: preserves reminder backward compatibility', () => {
  const cmd = resolveCaptureCommand('Remind me to pick up my meds this morning at Walgreens', OPTIONS)
  assert.equal(cmd.status, 'execute')
  assert.equal(cmd.tool, 'create_event')
  assert.equal(cmd.args.event_type, 'reminder')
  assert.equal(cmd.args.location, 'Walgreens')
})

test('resolveCaptureCommand: preserves event creation backward compatibility', () => {
  const cmd = resolveCaptureCommand('Create dinner with Kelly on 2026-08-09 at 7pm at Avocado Grill', OPTIONS)
  assert.equal(cmd.status, 'execute')
  assert.equal(cmd.tool, 'create_event')
  assert.equal(cmd.args.location, 'Avocado Grill')
  assert.deepEqual(cmd.args.members, ['Kelly'])
})

test('client rule matching: matches phrases in body and sorts by deterministic precedence (sender > domain > subject > phrase)', () => {
  const rules = [
    { pattern_type: 'phrase', pattern_value: 'field trip waiver', rule_directive: 'elevate_action', default_archetype: 'executive_actions', confidence: 0.8, active: true },
    { pattern_type: 'domain', pattern_value: 'palmbeachschools.org', rule_directive: 'route_archetype', default_archetype: 'estate_knowledge', confidence: 0.9, active: true },
    { pattern_type: 'sender', pattern_value: 'principal@palmbeachschools.org', rule_directive: 'elevate_action', default_archetype: 'executive_actions', confidence: 1.0, active: true },
    { pattern_type: 'subject', pattern_value: 'annual curriculum night', rule_directive: 'route_archetype', default_archetype: 'temporal_appointments', confidence: 0.85, active: true },
  ]

  const matched = matchCaptureRules(rules, {
    from: 'principal@palmbeachschools.org',
    subject: 'Annual Curriculum Night & Welcome',
    body: 'Please complete the field trip waiver before attending.',
  })

  assert.equal(matched.length, 4)
  assert.equal(matched[0].pattern_type, 'sender')
  assert.equal(matched[1].pattern_type, 'domain')
  assert.equal(matched[2].pattern_type, 'subject')
  assert.equal(matched[3].pattern_type, 'phrase')
})
