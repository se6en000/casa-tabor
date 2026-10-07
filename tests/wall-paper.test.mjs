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

// Canvas 58, the morning brief: the wall reaches past today — the week, Coming up, what's gone quiet.
test('the brief’s facts: the days ahead with what’s left to pack, Coming up nearest first, stalled projects, put-off to-dos — and no gift steps for the family', async () => {
  const { briefFacts } = await import('../src/wall/paper.ts')
  const saturday = buildDayPlan({ date: new Date(2026, 8, 26), members, routines, events })
  const checklist = events.filter((e) => /Softball/.test(e.title)).map((e, i) => ({ id: `c${i}`, event_id: e.id, label: 'Glove', checked: false, sort_order: 0 }))
  const comingUp = [
    { key: 'b', kind: 'birthday', title: 'Owen’s birthday', date: '2026-11-03', daysAway: 39, nextStep: 'Pick a gift', pokeOn: '2026-10-20', late: false },
    { key: 'h', kind: 'season', title: 'Halloween', date: '2026-10-31', daysAway: 36, nextStep: 'Plan costumes', pokeOn: '2026-10-01', late: false },
    { key: 'g', kind: 'birthday', title: 'Carl’s birthday', date: '2026-12-01', daysAway: 67, nextStep: 'Pick a gift', pokeOn: '2026-11-15', late: false },
  ]
  const todos = {
    nextUp: [{ id: 't1', title: 'Call the plumber', snoozeCount: 3, overdue: false, due: null }],
    groups: { quick: [{ id: 't2', title: 'Return the library books', snoozeCount: 0, overdue: true, due: '2026-09-20' }], fix: [], nudge: [], dated: [], unsorted: [] },
    projects: [{ id: 'p', title: 'Treehouse', done: 2, total: 6, next: 'Buy the lumber', nextEventId: null, aimDate: null }, { id: 'q', title: 'Done one', done: 3, total: 3, next: null, nextEventId: null, aimDate: null }],
    suggestions: [],
  }
  const more = briefFacts({ members, week: [friday, saturday], now: at(25, 9, 0), checklist, comingUp, todos })
  assert.equal(more.week.length, 1) // today isn't the days ahead
  assert.equal(more.week[0].day, 'Saturday, Sep 26')
  assert.ok(more.week[0].lines.some((l) => /still to pack Glove/.test(l)))
  assert.deepEqual(more.comingUp.map((c) => c.title), ['Halloween', 'Owen’s birthday', 'Carl’s birthday'])
  assert.equal(more.comingUp[1].nextStep, 'Time to start planning') // Owen reads the wall
  assert.equal(more.comingUp[2].nextStep, 'Pick a gift') // Carl doesn't
  assert.deepEqual(more.projects.map((p) => p.title), ['Treehouse'])
  assert.deepEqual(more.quiet, ['Call the plumber (put off 3 times)', 'Return the library books (overdue since 2026-09-20)'])
  assert.ok(more.people.includes('Giselle'))
})

test('the plain brief, before the server’s words: nothing wrong today, the days ahead, next month and way out from Coming up, the stalled project', async () => {
  const { fallbackBrief } = await import('../src/wall/paper.ts')
  const facts = paperFacts(friday, members, at(25, 9, 0))
  const brief = fallbackBrief(facts, {
    people: [], quiet: [],
    week: [{ day: 'Saturday, Sep 26', lines: ['12:30 Softball', 'all day: Grandma visiting'] }],
    comingUp: [{ title: 'Halloween', date: '2026-10-31', daysAway: 36, nextStep: 'Plan costumes', late: false }, { title: 'Thanksgiving', date: '2026-11-26', daysAway: 62, nextStep: 'Hosting or going?', late: false }],
    projects: [{ title: 'Treehouse', done: 2, total: 6, next: 'Buy the lumber', aim: null }],
  })
  assert.equal(brief.today[0].title, 'Nothing’s wrong')
  assert.deepEqual(brief.today[1], { title: 'Spirit Day', detail: 'Emme & Owen · wear school colors' })
  assert.deepEqual(brief.weekend, [{ title: 'Saturday, Sep 26', detail: '12:30 Softball, and 1 more' }])
  assert.deepEqual(brief.month, [{ title: 'Halloween · 5 weeks', detail: 'Plan costumes' }])
  assert.deepEqual(brief.wayOut, [{ title: 'Thanksgiving · 9 weeks', detail: 'Hosting or going?' }])
  assert.deepEqual(brief.forgot, { title: 'Treehouse — step 3 of 6', detail: 'Next: Buy the lumber.' })
  assert.equal(brief.feature, null)
})

// Jake, Oct 7: "maybe the morning paper can mention it a couple of times … if I snooze it I want it actually snoozed
// from all conversations till its due again".
test('the brief: a heads-up for what’s coming due; nothing snoozed, however often it was put off', async () => {
  const { briefFacts } = await import('../src/wall/paper.ts')
  const todos = {
    nextUp: [{ id: 'w', title: 'Clean the washing machine', snoozeCount: 0, overdue: false, due: '2026-09-25', stage: 'due' }],
    groups: {
      quick: [{ id: 'p', title: 'Call the plumber', snoozeCount: 3, snoozedUntil: '2026-10-02', overdue: true, due: '2026-09-20', stage: 'snoozed' }],
      fix: [], nudge: [], dated: [], unsorted: [],
      later: [{ id: 'h', title: 'Re-up Hello Fresh', snoozeCount: 0, overdue: false, due: '2026-10-27', stage: 'quiet' }, { id: 'g', title: 'Fix the gate latch', snoozeCount: 0, overdue: false, due: '2026-09-27', stage: 'heads_up' }],
    },
    projects: [], suggestions: [],
  }
  const more = briefFacts({ members, week: [friday], now: at(25, 9, 0), todos })
  assert.deepEqual(more.soon, ['Clean the washing machine (today)', 'Fix the gate latch (in 2 days)'])
  assert.deepEqual(more.quiet, [])
})
