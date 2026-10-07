import test from 'node:test'
import assert from 'node:assert/strict'
import { allDayCovers, allDayDates } from '../supabase/functions/_shared/all-day.mjs'

// Every way an all-day event is kept in the calendar (counted Oct 7), each on the day it means.
test('an all-day event is on the dates written on it, however it was kept', () => {
  const cases = [
    ['Google: midnight UTC to the next (Heather’s birthday)', '2026-10-08T00:00:00Z', '2026-10-09T00:00:00Z', '2026-10-08', '2026-10-08'],
    ['the app: midnight UTC to 23:59:59', '2026-10-08T00:00:00Z', '2026-10-08T23:59:59Z', '2026-10-08', '2026-10-08'],
    ['the house’s midnight (EDT)', '2026-10-08T04:00:00Z', '2026-10-09T04:00:00Z', '2026-10-08', '2026-10-08'],
    ['the house’s midnight (EST)', '2026-12-08T05:00:00Z', '2026-12-09T05:00:00Z', '2026-12-08', '2026-12-08'],
    ['noon to noon', '2026-10-08T12:00:00Z', '2026-10-09T12:00:00Z', '2026-10-08', '2026-10-08'],
    ['a to-do with a quarter hour', '2026-10-08T04:00:00Z', '2026-10-08T04:15:00Z', '2026-10-08', '2026-10-08'],
    ['two days, inclusive end', '2026-10-08T00:00:00Z', '2026-10-09T23:59:59Z', '2026-10-08', '2026-10-09'],
    ['four days, exclusive end', '2026-10-08T00:00:00Z', '2026-10-12T00:00:00Z', '2026-10-08', '2026-10-11'],
    ['three days, house midnights', '2026-10-08T04:00:00Z', '2026-10-11T04:00:00Z', '2026-10-08', '2026-10-10'],
  ]
  for (const [name, s, e, first, last] of cases) assert.deepEqual(allDayDates(s, e), { first, last }, name)
})

test('Heather’s birthday is on the 8th, not the evening of the 7th', () => {
  assert.equal(allDayCovers('2026-10-08T00:00:00Z', '2026-10-09T00:00:00Z', '2026-10-07'), false)
  assert.equal(allDayCovers('2026-10-08T00:00:00Z', '2026-10-09T00:00:00Z', '2026-10-08'), true)
  assert.equal(allDayCovers('2026-10-08T00:00:00Z', '2026-10-09T00:00:00Z', '2026-10-09'), false)
  assert.equal(allDayDates('nonsense', ''), null)
})

// The two places that read it wrong (Oct 7): the wall's day and what the assistant is told.
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { buildFullAiSystem } from '../supabase/functions/_shared/assistant-full-ai.mjs'

const heather = { id: 'heather', title: 'Heather’s Birthday', start_time: '2026-10-08T00:00:00+00:00', end_time: '2026-10-09T00:00:00+00:00', all_day: true, event_type: 'event', status: 'confirmed', members: [] }

test('the wall: Heather’s birthday is on Thursday’s day, not Wednesday’s', () => {
  const day = (d) => buildDayPlan({ date: new Date(2026, 9, d), members: [], routines: [], events: [heather], chores: [] }).allDay.map((a) => a.title)
  assert.deepEqual(day(7), [])
  assert.deepEqual(day(8), ['Heather’s Birthday'])
  assert.deepEqual(day(9), [])
})

test('the assistant is told Thu Oct 8, all day — not Wed Oct 7', () => {
  const system = buildFullAiSystem({ family: [], events: [heather], groceries: [], pending: null, onScreenIds: [], utcOffset: '-04:00', now: new Date('2026-10-07T15:40:00Z'), homeCity: 'West Palm Beach' })
  assert.match(system, /\[heather\] Thu Oct 8, all day · Heather’s Birthday/)
})

import { allDayWords } from '../supabase/functions/_shared/all-day.mjs'
import { buildTurnPrompt } from '../supabase/functions/_shared/assistant-turn-context.mjs'

test('all-day words: one day, several days, long weekday names for the quick answers', () => {
  assert.equal(allDayWords(heather.start_time, heather.end_time), 'Thu Oct 8')
  assert.equal(allDayWords(heather.start_time, heather.end_time, 'long'), 'Thursday Oct 8')
  assert.equal(allDayWords('2026-10-08T04:00:00Z', '2026-10-11T04:00:00Z'), 'Thu Oct 8 – Sat Oct 10')
})

test('the quick answers are told Thursday Oct 8 too (the path that said “starting at 8:00 PM”)', () => {
  const prompt = buildTurnPrompt({ messages: [{ role: 'user', content: 'Is Heather’s birthday today or tomorrow?' }], draft: null, referents: [], upcoming: [{ ...heather, people: [], drivers: [], place: null }], family: [], nowLine: 'Now: Wednesday Oct 7, 11:40 AM', utcOffset: '-04:00', nowIso: '2026-10-07T15:40:00Z' })
  assert.match(prompt, /\[heather\] Heather’s Birthday — Thursday Oct 8, all day/)
  assert.doesNotMatch(prompt, /Heather’s Birthday — Wednesday/)
})

import { holidaysSection } from '../supabase/functions/_shared/school-calendar.mjs'
import { paperPrompt } from '../supabase/functions/_shared/morning-paper.mjs'

// Jake, Oct 7: "I just alexa /AI to have knowledge of them and be proactive with them espcially gift and potential
// long school vacation holidays like thanksgiveing / xmas, spring break florida".
test('Alexa and the brief know the holidays and the school breaks ahead', () => {
  const s = holidaysSection('2026-10-07')
  assert.match(s, /- Mon Oct 12: Columbus Day\n- Mon Oct 12: no school — Columbus Day/)
  assert.match(s, /- Mon Nov 23 – Fri Nov 27: no school — Thanksgiving break \(5 school days off\)/)
  assert.match(s, /- Mon Dec 21 – Fri Jan 1: no school — Winter break \(10 school days off\)/)
  assert.match(s, /- Mon Mar 22 – Fri Mar 26: no school — Spring break/)
  assert.match(s, /Never make up a break/)
  const system = buildFullAiSystem({ family: [], events: [], groceries: [], pending: null, onScreenIds: [], utcOffset: '-04:00', now: new Date('2026-10-07T15:40:00Z'), homeCity: 'West Palm Beach' })
  assert.match(system, /HOLIDAYS AND SCHOOL DAYS OFF/)
  const facts = { date: '2026-10-07', day: 'Wednesday, October 7, 2026', runs: [], away: [], also: [], weatherNow: null }
  assert.match(paperPrompt(facts, null, { people: [], week: [], comingUp: [], projects: [], quiet: [] }), /Winter break/)
  assert.match(holidaysSection('2027-08-01'), /school calendar for this year isn't in yet/)
})
