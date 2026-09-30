import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarPatterns, buildLearnerPrompt, readLearnerOutput, decideConfidence, isKnown } from '../supabase/functions/_shared/memory-learner.mjs'

// Casa's memory, phase 2 (design doc c1bc97e8): a nightly read of what happened. It writes what it can back up;
// "sure" is decided here, never by the model (two kinds of evidence, or the calendar 5+ times over 3+ weeks); in the
// first week (shadow) everything new is "not sure yet". Corrected and forgotten facts are never proposed again.
const family = [{ id: 'm-liv', name: 'Liv' }, { id: 'm-emme', name: 'Emme' }]

test('calendar patterns: how often each person has the same thing, over how many weeks', () => {
  const ev = (title, day, who, place = null) => ({ title, start_time: `2026-${day}T22:00:00Z`, people: who, place })
  const p = calendarPatterns([
    ev('Liv Huskies Softball Practice', '09-14', ['Liv'], 'Lake Lytal Park'), ev('Liv Huskies Softball Practice', '09-21', ['Liv'], 'Lake Lytal Park'),
    ev('Liv Huskies Softball Practice #3', '09-28', ['Liv'], 'Lake Lytal Park'), ev('Emme Practice Violin with Meredith', '09-18', ['Emme']),
    ev('Dentist', '09-02', ['Liv']),
  ])
  assert.deepEqual(p.map((x) => [x.who, x.title, x.count, x.weeks, x.place]), [['Liv', 'Liv Huskies Softball Practice', 3, 3, 'Lake Lytal Park']])
})

test('sure only with two kinds of evidence or the calendar 5+ times over 3+ weeks; in shadow, never', () => {
  assert.equal(decideConfidence({ kinds: ['calendar', 'email'], count: 2, weeks: 1 }, { shadow: false }), 'sure')
  assert.equal(decideConfidence({ kinds: ['calendar'], count: 6, weeks: 4 }, { shadow: false }), 'sure')
  assert.equal(decideConfidence({ kinds: ['calendar'], count: 6, weeks: 2 }, { shadow: false }), 'not_sure')
  assert.equal(decideConfidence({ kinds: ['conversation'], count: 1, weeks: 1 }, { shadow: false }), 'not_sure')
  assert.equal(decideConfidence({ kinds: ['calendar', 'email'], count: 9, weeks: 9 }, { shadow: true }), 'not_sure')
})

test('already known in any state (active, corrected, forgotten) is never proposed again', () => {
  const rows = [{ about_label: 'Liv', text: 'Played for Team Fury in the summer', status: 'forgotten' }, { about_label: 'Liv', text: 'In 8th grade', status: 'active' }]
  assert.equal(isKnown({ about: 'Liv', text: 'played for team fury in the summer.' }, rows), true)
  assert.equal(isKnown({ about: 'liv', text: 'In 8th grade' }, rows), true)
  assert.equal(isKnown({ about: 'Liv', text: 'Does debate on Thursdays' }, rows), false)
})

test('the model’s answer read strictly: facts with evidence and kinds, confirmations by id, open thoughts', () => {
  const out = readLearnerOutput({
    facts: [{ about: 'Liv', text: 'Practices with the Huskies on Mondays at 6', words: ['Huskies'], kinds: ['calendar', 'bogus'], count: 3, weeks: 3, evidence: [{ what: '3 practices', when: 'Sep' }], sensitive: false }, { about: '', text: 'x' }],
    confirms: [{ id: 'a2', kinds: ['email'], evidence: [{ what: 'an email', when: 'Sep 30' }] }, { id: 7 }],
    thoughts: [{ about: 'Jake', text: 'Decide on the pergola', when: '2026-09-30' }, { text: '' }],
  })
  assert.deepEqual(out.facts, [{ about: 'Liv', text: 'Practices with the Huskies on Mondays at 6', words: ['Huskies'], kinds: ['calendar'], count: 3, weeks: 3, evidence: [{ what: '3 practices', when: 'Sep' }], sensitive: false }])
  assert.deepEqual(out.confirms, [{ id: 'a2', kinds: ['email'], evidence: [{ what: 'an email', when: 'Sep 30' }] }])
  assert.deepEqual(out.thoughts, [{ about: 'Jake', text: 'Decide on the pergola', when: '2026-09-30' }])
})

test('the prompt carries the evidence and what is already known, and asks for unfinished topics', () => {
  const p = buildLearnerPrompt({ patterns: [{ who: 'Liv', title: 'Huskies practice', count: 3, weeks: 3, first: '2026-09-14', last: '2026-09-28', place: 'Lake Lytal Park' }], emails: [{ from: 'Christyna Turner', subject: 'Welcome to 4th grade!', gist: null, received: '2026-08-10' }], conversations: [[{ role: 'user', content: 'lets think about a pergola' }, { role: 'assistant', content: 'Wood or aluminum?' }]], memory: [{ id: 'a1', about_label: 'Liv', text: 'Goes to Bak', status: 'active', confidence: 'sure' }], family, today: '2026-10-01', lists: ['Project: Halloween costumes'] })
  assert.match(p, /Liv · Huskies practice · 3 times over 3 weeks/)
  assert.match(p, /Christyna Turner · Welcome to 4th grade!/)
  assert.match(p, /\[a1\] Liv: Goes to Bak \(active, sure\)/)
  assert.match(p, /unfinished/)
  assert.match(p, /ALREADY ON A LIST[^\n]*\n- Project: Halloween costumes/)
  assert.match(p, /never propose anything already listed/i)
  assert.match(p, /Not facts: one-time events or appointments/)
  assert.match(p, /Never about Casa itself, testing it, or the app/)
})
