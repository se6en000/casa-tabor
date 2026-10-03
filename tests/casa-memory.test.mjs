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

// Phase 3 (using it): whose a flyer, an email or an event is, from the sure facts' words.
test('a person’s line for a prompt: their sure facts and the words that point to them', async () => {
  const { personLine } = await import('../supabase/functions/_shared/casa-memory.mjs')
  const facts = [
    { kind: 'fact', about_member_id: 'm-liv', confidence: 'sure', text: 'Goes to Bak Middle School', words: ['Bak'] },
    { kind: 'fact', about_member_id: 'm-liv', confidence: 'sure', text: 'Plays softball for the Huskies', words: ['Huskies', 'softball'] },
    { kind: 'fact', about_member_id: 'm-liv', confidence: 'not_sure', text: 'In 8th grade', words: ['8th grade'] },
  ]
  assert.equal(personLine(family[0], facts), 'Liv (child) — Goes to Bak Middle School; Plays softball for the Huskies · words: Bak, Huskies, softball')
  assert.equal(personLine(family[2], facts), 'Owen (child)')
})

test('an event is someone’s when its words point to one person only', async () => {
  const { memberFromWords } = await import('../supabase/functions/_shared/casa-memory.mjs')
  const facts = [
    { kind: 'fact', about_member_id: 'm-liv', confidence: 'sure', words: ['Huskies', 'softball', 'Bak'] },
    { kind: 'fact', about_member_id: 'm-owen', confidence: 'sure', words: ['Kindergarten', 'Hope Center'] },
    { kind: 'fact', about_member_id: 'm-owen', confidence: 'not_sure', words: ['swim'] },
    { kind: 'fact', about_member_id: null, confidence: 'sure', words: ['dentist'] },
  ]
  assert.equal(memberFromWords('Softball: RPB Blaze @ Huskies', facts, family)?.name, 'Liv')
  assert.equal(memberFromWords('Kindergarten Teddy Bear Picnic', facts, family)?.name, 'Owen')
  assert.equal(memberFromWords('Bakery run', facts, family), null, 'whole words only')
  assert.equal(memberFromWords('Get Owen a swim lesson', facts, family), null, 'not sure yet is never used')
  assert.equal(memberFromWords('Huskies game, then Hope Center', facts, family), null, 'two people: no guess')
})

test('a new event with no one on it: the one its words point to, else whoever is speaking, else the admin; a parent going drives', async () => {
  const { defaultPeople } = await import('../supabase/functions/_shared/casa-memory.mjs')
  const fam = [...family, { id: 'm-kelly', name: 'Kelly', role: 'parent', can_drive: true, is_admin: false }].map((m) => (m.id === 'm-jake' ? { ...m, can_drive: true, is_admin: true } : m))
  const facts = [{ kind: 'fact', about_member_id: 'm-liv', confidence: 'sure', words: ['Huskies'] }]
  assert.deepEqual(defaultPeople({ title: 'Huskies practice', people: [], speakerId: 'm-kelly', facts, family: fam }), { people: ['Liv'], driver: null })
  assert.deepEqual(defaultPeople({ title: 'Dentist', people: [], speakerId: 'm-kelly', facts, family: fam }), { people: ['Kelly'], driver: 'Kelly' })
  assert.deepEqual(defaultPeople({ title: 'Dentist', people: [], speakerId: null, facts, family: fam }), { people: ['Jake'], driver: 'Jake' })
  assert.deepEqual(defaultPeople({ title: 'Haircut', people: ['Owen'], speakerId: 'm-jake', facts, family: fam }), { people: ['Owen'], driver: null }, 'named people stay as said')
})

// Jake, Oct 3: "when Kelly is logged in and says, Im going to the gym at 7:30 … kelly is the attendee and driver
// without having to say it. And the same would work for if I was logged in."
test('"I" is whoever is signed in: they go, and a parent going drives — even when the title points at someone else', async () => {
  const { defaultPeople } = await import('../supabase/functions/_shared/casa-memory.mjs')
  const fam = [...family, { id: 'm-kelly', name: 'Kelly', role: 'parent', can_drive: true, is_admin: false }].map((m) => (m.id === 'm-jake' ? { ...m, can_drive: true, is_admin: true } : m))
  const facts = [{ kind: 'fact', about_member_id: 'm-jake', confidence: 'sure', words: ['gym'] }]
  assert.deepEqual(defaultPeople({ title: 'Gym', said: 'I’m going to the gym at 7:30', people: [], speakerId: 'm-kelly', facts, family: fam }), { people: ['Kelly'], driver: 'Kelly' })
  assert.deepEqual(defaultPeople({ title: 'Gym', said: 'im going to the gym at 7:30', people: [], speakerId: 'm-jake', facts, family: fam }), { people: ['Jake'], driver: 'Jake' })
  assert.deepEqual(defaultPeople({ title: 'Gym', said: 'add the gym at 7:30', people: [], speakerId: 'm-kelly', facts, family: fam }), { people: ['Jake'], driver: 'Jake' }, 'no "I": the words still point')
  // Named by the model, with no driver: the one parent going drives.
  assert.deepEqual(defaultPeople({ title: 'Gym', said: 'I’m going to the gym', people: ['Kelly'], speakerId: 'm-kelly', facts, family: fam }), { people: ['Kelly'], driver: 'Kelly' })
  assert.deepEqual(defaultPeople({ title: 'Dentist', said: 'I’m taking Owen to the dentist', people: ['Kelly', 'Owen'], speakerId: 'm-kelly', facts, family: fam }), { people: ['Kelly', 'Owen'], driver: 'Kelly' })
  assert.deepEqual(defaultPeople({ title: 'Dinner', said: 'dinner with Jake and me Friday', people: ['Jake', 'Kelly'], speakerId: 'm-kelly', facts, family: fam }), { people: ['Jake', 'Kelly'], driver: 'Kelly' }, 'two parents: the one talking')
  assert.deepEqual(defaultPeople({ title: 'Dinner', said: 'dinner for Jake and Kelly Friday', people: ['Jake', 'Kelly'], speakerId: null, facts, family: fam }), { people: ['Jake', 'Kelly'], driver: null }, 'two parents, nobody signed in: no guess')
})

test('Casa is told who is talking: "I" is them, "you" is Casa', async () => {
  const { speakerLine } = await import('../supabase/functions/_shared/casa-memory.mjs')
  const fam = [{ id: 'm-kelly', name: 'Kelly', role: 'parent' }, { id: 'm-jake', name: 'Jake', role: 'parent', is_admin: true }]
  assert.match(speakerLine('m-kelly', fam), /Kelly is talking.*"I", "me" and "my" mean Kelly.*"you" means you, Casa/s)
  assert.match(speakerLine(null, fam), /nobody is signed in.*mean Jake/is)
})

// Phase 4: open thoughts come back — one a day at most, each at most weekly, quiet after three unanswered.
test('which open thought is due: none if one came up in the last 20 hours; else the oldest not raised this week, fewer than three times', async () => {
  const { dueThought } = await import('../supabase/functions/_shared/casa-memory.mjs')
  const now = new Date('2026-10-02T15:00:00Z')
  const t = (id, created, last, count = 0) => ({ id, kind: 'thought', status: 'active', created_at: created, last_nudged_at: last, nudge_count: count })
  assert.equal(dueThought([t('a', '2026-09-30T10:00:00Z', null), t('b', '2026-09-29T10:00:00Z', null)], now)?.id, 'b')
  assert.equal(dueThought([t('a', '2026-09-30T10:00:00Z', '2026-10-02T02:00:00Z', 1), t('b', '2026-09-29T10:00:00Z', null)], now), null, 'one came up last night')
  assert.equal(dueThought([t('a', '2026-09-20T10:00:00Z', '2026-09-28T10:00:00Z', 1)], now), null, 'raised this week')
  assert.equal(dueThought([t('a', '2026-09-01T10:00:00Z', '2026-09-20T10:00:00Z', 3)], now), null, 'quiet after three')
  assert.equal(dueThought([t('a', '2026-10-02T14:00:00Z', null)], now), null, 'not the same day it was kept')
})

test('a due thought is marked for the model, which brings it up once at the end', async () => {
  const { memoryContext } = await import('../supabase/functions/_shared/casa-memory.mjs')
  const block = memoryContext(rows, { due: 't1' })
  assert.match(block, /- \[t1\] Jake: Look at a pergola in the spring \(since Sep 30\) — DUE: bring it up once, in passing, at the end of your answer/)
})

test('the privacy switch: built, off by default; when on, sensitive facts stay off the wall', () => {
  const server = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.match(server, /\.filter\(\(m\) => !\(privacy\?\.value === true && onWall && m\.sensitive\)\)/)
  const sql = readFileSync(new URL('../supabase/migrations/20261001240000_casa_memory_learner.sql', import.meta.url), 'utf8')
  assert.match(sql, /\('memory_private_on_wall', 'false'::jsonb/)
})

test('a person\'s page: their facts only, sure first then not sure yet, each with where it came from; the privacy switch hides sensitive ones', async () => {
  const { aboutPerson } = await import('../supabase/functions/_shared/casa-memory.mjs')
  const rows = [
    { id: 'a', kind: 'fact', about_member_id: 'owen', text: 'In kindergarten at Palm Beach Public', confidence: 'sure', source: 'told', evidence: [], status: 'active' },
    { id: 'b', kind: 'fact', about_member_id: 'owen', text: 'Therapist: Hope Center', confidence: 'sure', source: 'learned', evidence: [{ what: '8 emails' }], status: 'active', sensitive: true },
    { id: 'c', kind: 'fact', about_member_id: 'owen', text: 'School contact: Preservation Foundation?', confidence: 'not_sure', source: 'old_app', evidence: [], status: 'active' },
    { id: 'd', kind: 'fact', about_member_id: 'liv', text: 'Goes to Bak', confidence: 'sure', source: 'told', evidence: [], status: 'active' },
    { id: 'e', kind: 'thought', about_member_id: 'owen', text: 'Look into swim lessons', confidence: 'sure', source: 'told', evidence: [], status: 'active' },
    { id: 'f', kind: 'fact', about_member_id: 'owen', text: 'Old teacher', confidence: 'sure', source: 'told', evidence: [], status: 'corrected' },
  ]
  assert.deepEqual(aboutPerson(rows, 'owen'), {
    sure: [{ id: 'a', text: 'In kindergarten at Palm Beach Public', from: 'you said it' }, { id: 'b', text: 'Therapist: Hope Center', from: '8 emails' }],
    notSure: [{ id: 'c', text: 'School contact: Preservation Foundation?', from: 'your old contacts' }],
  })
  assert.deepEqual(aboutPerson(rows, 'owen', { hideSensitive: true }).sure.map((f) => f.id), ['a'])
})
