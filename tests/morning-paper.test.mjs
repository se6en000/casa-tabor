import test from 'node:test'
import assert from 'node:assert/strict'
import { skyFacts, paperPrompt, parsePaperWords, cleanFacts } from '../supabase/functions/_shared/morning-paper.mjs'

// Wednesday Oct 7, West Palm Beach (Open-Meteo, fetched Oct 6).
const hourly = {
  time: Array.from({ length: 24 }, (_, h) => `2026-10-07T${String(h).padStart(2, '0')}:00`),
  temperature_2m: [74, 74, 74, 74, 74, 75, 75, 76, 76, 79, 80, 80, 82, 84, 84, 83, 81, 82, 79, 77, 76, 76, 75, 75],
  precipitation_probability: [5, 5, 5, 5, 5, 8, 11, 12, 12, 10, 9, 12, 14, 14, 22, 34, 37, 34, 39, 42, 49, 45, 30, 20],
}

test('the sky in facts: the morning, the high, when rain gets likely', () => {
  assert.equal(skyFacts(hourly), '76° at 7 AM; high 84° about 1 PM; rain chance 30% or more from 3 PM, up to 49% about 8 PM')
  assert.equal(skyFacts({ time: [] }), null)
})

const facts = {
  date: '2026-10-07', day: 'Wednesday, October 7, 2026',
  runs: [{ at: '7:00', text: 'Giselle takes Emme & Owen to Palm Beach Public', alert: null }, { at: '6:00', text: 'Liv · Huskies Softball Practice at Lake Lytal Park', alert: 'no driver yet' }],
  away: ['Jake flies to Dallas, leaving at 12:45'], also: ['Emme · Unit 2 Reading test'], weatherNow: null,
}

test('the prompt carries every fact, the alert, and the rules', () => {
  const p = paperPrompt(facts, skyFacts(hourly))
  assert.match(p, /6:00 · Liv · Huskies Softball Practice at Lake Lytal Park \(no driver yet\)/)
  assert.match(p, /Away or travelling: Jake flies to Dallas, leaving at 12:45/)
  assert.match(p, /All day: Emme · Unit 2 Reading test/)
  assert.match(p, /Sky: 76° at 7 AM/)
  assert.match(p, /Use only the facts above/)
})

test('the reply: three clean lines, or nothing', () => {
  assert.deepEqual(parsePaperWords('```json\n{"headline":"Jake flies to Dallas; Liv’s practice at 6 needs a driver.","deck":"Giselle has the 7:00 school run.","sky":"Warm, showers after 3."}\n```'),
    { headline: 'Jake flies to Dallas; Liv’s practice at 6 needs a driver.', deck: 'Giselle has the 7:00 school run.', sky: 'Warm, showers after 3.' })
  assert.equal(parsePaperWords('no json here'), null)
  assert.equal(parsePaperWords('{"headline":""}'), null)
  assert.equal(parsePaperWords(`{"headline":"${'x'.repeat(130)}","deck":"","sky":""}`), null)
  assert.equal(parsePaperWords('{"headline":"Sunny day ☀️","deck":"","sky":""}'), null)
})

test('the facts are kept to their shape (the wall’s key can call it)', () => {
  assert.equal(cleanFacts({ date: 'tomorrow' }), null)
  const c = cleanFacts({ ...facts, runs: Array.from({ length: 30 }, () => ({ at: '7:00', text: 'x'.repeat(500) })), extra: 'drop me' })
  assert.equal(c.runs.length, 12)
  assert.equal(c.runs[0].text.length, 120)
  assert.equal('extra' in c, false)
})
