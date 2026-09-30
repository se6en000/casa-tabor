import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { memoryContext, readRemember, mayChangeMemory } from '../supabase/functions/_shared/casa-memory.mjs'
import { FULL_AI_TOOLS, buildFullAiSystem, fullAiTools, READ_TOOLS } from '../supabase/functions/_shared/assistant-full-ai.mjs'
import { buildTurnPrompt } from '../supabase/functions/_shared/assistant-turn-context.mjs'

// Casa's memory, phase 1 (design doc c1bc97e8, Jake 2026-09-30: "ok lets build it"): facts and open thoughts,
// asked and fixed by talking — "what do you know about Liv", "that's wrong, she's in 8th grade", "forget that",
// "remember this" — saved at once in his words, no card.
const family = [{ id: 'm-liv', name: 'Liv', full_name: 'Olivia Tabor', role: 'child' }, { id: 'm-jake', name: 'Jake', full_name: 'Jacob Raymond Tabor', role: 'parent' }, { id: 'm-owen', name: 'Owen', full_name: 'Owen Tabor', role: 'child' }]
const rows = [
  { id: 'a1', kind: 'fact', about_label: 'Liv', text: 'Goes to Bak Middle School of the Arts', confidence: 'sure', source: 'old_app', evidence: [{ what: 'Jake told the old app', when: '2026-08-04' }], created_at: '2026-10-01T00:00:00Z' },
  { id: 'a2', kind: 'fact', about_label: 'Liv', text: 'Practices softball at Lake Lytal Park', confidence: 'not_sure', source: 'learned', evidence: [{ what: '3 practices on the calendar', when: '2026-09' }], created_at: '2026-10-01T00:00:00Z' },
  { id: 't1', kind: 'thought', about_label: 'Jake', text: 'Look at a pergola in the spring', confidence: 'sure', source: 'told', evidence: [], created_at: '2026-09-30T20:00:00Z' },
]

test('what Casa knows, for the model: sure first, then not sure yet, each with where from; open thoughts apart', () => {
  const block = memoryContext(rows)
  assert.match(block, /WHAT CASA KNOWS/)
  assert.match(block, /- \[a1\] Liv: Goes to Bak Middle School of the Arts \(sure · Jake told the old app, 2026-08-04\)/)
  assert.match(block, /- \[a2\] Liv: Practices softball at Lake Lytal Park \(not sure yet · 3 practices on the calendar, 2026-09\)/)
  assert.ok(block.indexOf('[a1]') < block.indexOf('[a2]'))
  assert.match(block, /OPEN THOUGHTS HE ASKED CASA TO KEEP:\n- \[t1\] Jake: Look at a pergola in the spring \(since Sep 30\)/)
  assert.equal(memoryContext([]), 'WHAT CASA KNOWS: nothing yet.')
})

test('remember: about a family member by any of their names, or anyone by name; a correction names what it replaces', () => {
  assert.deepEqual(readRemember({ about: 'Olivia', fact: 'In 8th grade', words: ['8th grade'], replaces_id: 'a1' }, { family, rows }),
    { about: 'Liv', memberId: 'm-liv', text: 'In 8th grade', kind: 'fact', words: ['8th grade'], replaces: 'a1' })
  assert.deepEqual(readRemember({ about: 'Coach Glen', fact: 'Coaches Liv’s softball team' }, { family, rows }),
    { about: 'Coach Glen', memberId: null, text: 'Coaches Liv’s softball team', kind: 'fact', words: [], replaces: null })
  assert.equal(readRemember({ about: 'Jake', fact: 'Look at a pergola in the spring', kind: 'thought' }, { family, rows }).kind, 'thought')
  assert.ok(readRemember({ about: 'Liv', fact: ' ' }, { family, rows }).error)
  assert.equal(readRemember({ about: 'Liv', fact: 'x', replaces_id: 'nope' }, { family, rows }).replaces, null, 'only a fact that is there')
})

test('only Jake and Kelly change the memory; the kids can ask', () => {
  assert.equal(mayChangeMemory('m-jake', family), true)
  assert.equal(mayChangeMemory('m-liv', family), false)
  assert.equal(mayChangeMemory(null, family), true, 'the wall with no one chosen: the parents use it')
})

test('the tools and the words that call them, for both models; memory talk goes to the full assistant', () => {
  for (const name of ['remember', 'forget', 'undo_memory']) {
    assert.ok(FULL_AI_TOOLS.some((t) => t.name === name), name)
    assert.ok(fullAiTools({ planning: true }).some((t) => t.name === name), `${name} while planning`)
    assert.ok(READ_TOOLS.has(name), `${name} runs at once (no card)`)
  }
  const system = buildFullAiSystem({ family, events: [], groceries: [], pending: null, onScreenIds: [], utcOffset: '-04:00', now: new Date('2026-09-30T20:00:00-04:00'), memory: rows })
  assert.match(system, /WHAT CASA KNOWS/)
  assert.match(system, /what Casa knows about someone/)
  assert.match(system, /saved at once, no card/)
  assert.match(buildTurnPrompt({ messages: [{ role: 'user', content: 'what do you know about Liv?' }], upcoming: [], family: [] }), /what Casa knows or remembers/)
  const server = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.match(server, /casa_memory_remember/)
  assert.match(server, /else if \(dryRun\) result = \{ saved: true, dry_run: true/)
})
