import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { paperFacts, fallbackWords, paperShows, joinNames } from '../src/wall/paper.ts'
import { FRIDAY, at, members, routines, events } from './fixtures/wall-day-2026-09-25.mjs'

// The morning paper (canvas 48a; Jake, Oct 6: "bring in the briefing into the calm screen … only for the morning …
// a button to dismiss it … a newspaper editorial look").
const friday = buildDayPlan({ date: FRIDAY, members, routines, events })

test('the paper’s facts are the wall’s own day: the runs still ahead, the all-day things', () => {
  const facts = paperFacts(friday, members, at(25, 9, 0), { temp: 78.4, condition: 'Partly cloudy' })
  assert.equal(facts.date, '2026-09-25')
  assert.equal(facts.day, 'Friday, September 25, 2026')
  // The 7:25 and 7:42 drop-offs are done by 9; the pickups are ahead.
  assert.deepEqual(facts.runs.map((r) => r.at), ['2:00', '3:30'])
  assert.match(facts.runs[0].text, /^Giselle picks up Emme & Owen at Palm Beach Public/)
  assert.equal(facts.runs[0].alert, null)
  assert.deepEqual(facts.also, ['Emme & Owen · Spirit Day · wear school colors'])
  assert.equal(facts.weatherNow, '78° and partly cloudy')
  // Before school, the drop-offs lead, at the time the car leaves.
  const early = paperFacts(friday, members, at(25, 6, 30))
  assert.deepEqual(early.runs.map((r) => r.at), ['7:25', '7:42', '2:00', '3:30'])
  assert.match(early.runs[0].text, /^Jake takes Emme & Owen to Palm Beach Public/)
})

test('a run with nobody driving says so, and leads the plain headline', () => {
  const plan = { ...friday, trips: friday.trips.map((t) => (t.kind === 'pickup' && t.travelerIds.includes('liv') ? { ...t, driverId: null } : t)) }
  const facts = paperFacts(plan, members, at(25, 9, 0))
  const liv = facts.runs.find((r) => r.text.includes('Liv'))
  assert.equal(liv.alert, 'no driver yet')
  assert.match(liv.text, /^Pick up Liv at /)
  assert.match(fallbackWords(facts).headline, /^Pick up Liv at .* at 3:30 still needs a driver\.$/)
})

test('plain words when nothing stands out', () => {
  const words = fallbackWords({ date: '2026-09-25', day: 'Friday, September 25, 2026', runs: [], away: [], also: ['Heather’s birthday'], weatherNow: '78° and clear' })
  assert.equal(words.headline, 'An easy Friday.')
  assert.equal(words.deck, 'Nothing on the road; Heather’s birthday.')
  assert.equal(words.sky, '78° and clear.')
})

test('the paper shows on calm mornings until 11, not after it’s put away; a preview shows it any time', () => {
  const nine = at(25, 9, 0)
  assert.equal(paperShows({ posture: 'calm', now: nine, dismissedOn: null, previewing: false }), true)
  assert.equal(paperShows({ posture: 'launch', now: nine, dismissedOn: null, previewing: false }), false)
  assert.equal(paperShows({ posture: 'calm', now: at(25, 11, 0), dismissedOn: null, previewing: false }), false)
  assert.equal(paperShows({ posture: 'calm', now: nine, dismissedOn: '2026-09-25', previewing: false }), false)
  assert.equal(paperShows({ posture: 'calm', now: nine, dismissedOn: '2026-09-24', previewing: false }), true)
  assert.equal(paperShows({ posture: 'evening', now: at(25, 20, 0), dismissedOn: '2026-09-25', previewing: true }), true)
})

test('names in a line', () => {
  assert.equal(joinNames(['Emme']), 'Emme')
  assert.equal(joinNames(['Emme', 'Owen']), 'Emme & Owen')
  assert.equal(joinNames(['Liv', 'Emme', 'Owen']), 'Liv, Emme & Owen')
})
