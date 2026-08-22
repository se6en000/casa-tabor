import test from 'node:test'
import assert from 'node:assert/strict'

function resolveLearnedAssignee(text, domain, rules) {
  if (!text) return null
  const lower = text.toLowerCase()

  if (rules.keywordRules) {
    for (const [kw, member] of Object.entries(rules.keywordRules)) {
      if (lower.includes(kw.toLowerCase())) return member
    }
  }

  if (domain && rules.domainRules) {
    const domLower = domain.toLowerCase()
    for (const [dom, member] of Object.entries(rules.domainRules)) {
      if (domLower.includes(dom.toLowerCase())) return member
    }
  }

  return null
}

test('resolves learned assignee by keyword rule match', () => {
  const rules = {
    keywordRules: {
      'fast ela reading assessment': 'Liv',
      'strings': 'Emme',
      'kindergarten': 'Owen',
    },
    domainRules: {},
  }

  const result = resolveLearnedAssignee('FAST ELA Reading Assessment (Liv · 4th Grade)', 'palmbeachschools.org', rules)
  assert.equal(result, 'Liv')

  const stringsResult = resolveLearnedAssignee('Early Strings Rehearsal Drop-off', null, rules)
  assert.equal(stringsResult, 'Emme')
})

test('falls back to domain rules when no keyword match', () => {
  const rules = {
    keywordRules: {},
    domainRules: {
      'palmbeachschools.org': 'Liv',
      'orchestra.org': 'Emme',
    },
  }

  const result = resolveLearnedAssignee('School Newsletter & Calendar Update', 'palmbeachschools.org', rules)
  assert.equal(result, 'Liv')
})

test('returns null when no rule matches', () => {
  const rules = {
    keywordRules: { 'math test': 'Liv' },
    domainRules: { 'amazon.com': 'Jake' },
  }

  const result = resolveLearnedAssignee('Random unrelated event', 'google.com', rules)
  assert.equal(result, null)
})
