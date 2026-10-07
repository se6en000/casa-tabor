import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CORE, applyReflection, cleanPersona, personaForBrief, personaSection, reflectPrompt } from '../supabase/functions/_shared/house-persona.mjs'
import { buildFullAiSystem } from '../supabase/functions/_shared/assistant-full-ai.mjs'
import { paperPrompt } from '../supabase/functions/_shared/morning-paper.mjs'

const notes = [
  { id: 'n1', text: 'Taco Tuesday is sacred.', source: 'you said so, Oct 2', pinned: true, added: '2026-10-02' },
  { id: 'n2', text: 'Jake calls the Pi "the box".', source: 'you said so, Oct 4', pinned: false, added: '2026-10-04' },
]

test('nothing stored: the house, Some, no notes', () => {
  const p = cleanPersona(null)
  assert.equal(p.core, DEFAULT_CORE)
  assert.equal(p.level, 'some')
  assert.deepEqual(p.notes, [])
  assert.equal(cleanPersona({ level: 'loud', notes: [{ text: 'no id' }, 'x'] }).level, 'some')
  assert.deepEqual(cleanPersona({ notes: [{ text: 'no id' }] }).notes, [])
})

test('her name is Alexa, she is the house, and the personality never reaches the logistics', () => {
  const s = personaSection({ level: 'playful', notes })
  assert.match(s, /your name is Alexa/)
  assert.match(s, /voice of Tabor House: The house itself/)
  assert.match(s, /^HOW MUCH: Playful/m)
  assert.match(s, /WHERE IT NEVER GOES: confirmations, times, dates, drivers/)
  assert.match(s, /never hint at a gift or surprise/)
  assert.match(s, /- Taco Tuesday is sacred\./)
  assert.doesNotMatch(personaSection(null), /HOUSE NOTES/)
  assert.match(personaSection({ level: 'quiet' }), /Quiet: almost all business/)
})

test('the assistant knows who she is — Alexa, never Casa, no longer nameless', () => {
  const system = buildFullAiSystem({ family: [], events: [], groceries: [], pending: null, onScreenIds: [], utcOffset: -240, now: new Date('2026-10-07T14:00:00Z'), homeCity: 'West Palm Beach', persona: { notes } })
  assert.match(system, /Your name is Alexa and you are the house itself/)
  assert.match(system, /never call yourself Casa/)
  assert.doesNotMatch(system, /no name of your own/)
  assert.match(system, /HOUSE NOTES[^\n]*\n- Taco Tuesday is sacred\./)
})

test('the morning brief hears her voice and the notes; without a persona nothing changes', () => {
  const facts = { date: '2026-10-07', day: 'Wednesday, October 7, 2026', runs: [], away: [], also: [], weatherNow: null }
  assert.match(paperPrompt(facts, null, null, null, personaForBrief({ notes })), /you are Alexa, the house\): The house itself.*House notes you may call back to: Taco Tuesday is sacred\. \| Jake calls the Pi/)
  assert.doesNotMatch(paperPrompt(facts, null), /Alexa/)
})

test('the weekly look back: kept notes are marked, the week is read', () => {
  const prompt = reflectPrompt({ persona: { notes }, conversations: [{ role: 'user', content: 'haha good one' }, { role: 'assistant', content: 'I try.' }], family: ['Jake', 'Kelly'] })
  assert.match(prompt, /n1 · Taco Tuesday is sacred\. · you said so, Oct 2 · KEPT/)
  assert.match(prompt, /n2 · .* · not kept/)
  assert.match(prompt, /Them: haha good one\nAlexa: I try\./)
  assert.match(prompt, /THE FAMILY: Jake, Kelly/)
  assert.match(prompt, /Notes are about THEM/)
  assert.match(prompt, /voice transcripts: overheard talk/)
})

test('the look back applied: a kept note is never dropped, private and gift notes never added, three new at most', () => {
  let i = 0
  const reply = JSON.stringify({
    drop: ['n1', 'n2'],
    add: [
      { text: 'Owen laughs at any joke about the dog.', source: 'you laughed, Tuesday' },
      { text: 'Liv’s meds are at 7:30.', source: 'chores' },
      { text: 'Kelly’s birthday gift is a bike.', source: 'Jake' },
      { text: 'They like it when I check their email.', source: 'Oct 5' },
      { text: 'Taco Tuesday is sacred.', source: 'again' },
      { text: 'Emme says “easy peasy”.', source: 'Emme, Thursday' },
      { text: 'Pizza on Fridays.', source: 'you said so' },
      { text: 'A fourth new one.', source: 'x' },
    ],
  })
  const next = applyReflection({ notes }, `here you go ${reply}`, '2026-10-11', () => `new${++i}`)
  assert.deepEqual(next.notes.map((n) => n.text), ['Taco Tuesday is sacred.', 'Owen laughs at any joke about the dog.', 'Emme says “easy peasy”.', 'Pizza on Fridays.'])
  assert.equal(next.notes[1].pinned, false)
  assert.equal(next.notes[1].added, '2026-10-11')
  assert.equal(next.updatedAt, '2026-10-11')
  assert.equal(applyReflection({ notes }, 'not json', '2026-10-11'), null)
  assert.deepEqual(applyReflection({ notes }, '{"drop": [], "add": []}', '2026-10-11').notes, cleanPersona({ notes }).notes)
})
