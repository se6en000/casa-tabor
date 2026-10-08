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

// Jake, Oct 8: "i want the morning paper to show case the morning, can it only get interupted by me dismissing it, or
// when there is a leave event in 15 mins?" → it comes back once the car's gone; something at home counts too.
test('the paper holds the morning from 6: only a leave within 15 minutes, something at home soon, or putting it away ends it', () => {
  const plan = buildDayPlan({ date: FRIDAY, members, routines, events })
  const shows = (h, m, extra = {}) => paperShows({ posture: 'launch', now: at(25, h, m), dismissedOn: null, previewing: false, plan, ...extra })
  assert.equal(shows(5, 50), false, 'not before 6')
  assert.equal(shows(6, 30), true, 'the morning rush is the paper’s')
  assert.equal(shows(7, 9), true, 'sixteen minutes before the 7:25 run')
  assert.equal(shows(7, 11), false, 'the 7:25 run is fourteen minutes out')
  assert.equal(shows(7, 27), false, 'just leaving')
  assert.equal(shows(7, 35), false, 'the 7:42 run is seven minutes out')
  assert.equal(shows(7, 50), true, 'the car’s gone: back to the paper')
  assert.equal(shows(10, 59), true)
  assert.equal(shows(11, 0), false, 'until 11')
  assert.equal(shows(8, 0, { dismissedOn: '2026-09-25' }), false, 'put away for the day')
  assert.equal(shows(8, 0, { posture: 'evening' }), false)
  // Something at home in a quarter of an hour.
  const call = { id: 'call', title: 'Call with the bank', event_type: 'event', all_day: false, start_time: at(25, 9, 30).toISOString(), end_time: at(25, 10, 0).toISOString(), location_name: null, address: null, members: [{ family_member_id: 'jake-id', role: 'attendee' }] }
  const withCall = buildDayPlan({ date: FRIDAY, members, routines, events: [...events, call] })
  const home = (h, m) => paperShows({ posture: 'launch', now: at(25, h, m), dismissedOn: null, previewing: false, plan: withCall })
  assert.equal(home(9, 10), true)
  assert.equal(home(9, 20), false, 'the call is ten minutes out')
  assert.equal(home(9, 45), false, 'the call is on')
  assert.equal(home(10, 5), true, 'the call is over')
})

// Canvas 72 (Jake, Oct 8: "please include a left right swipe to move between the pages … I want to see how it will be
// on the pi"): a sideways swipe turns the page; a tap, a slow wander or a mostly-up-and-down drag doesn't.
test('the paper turns on a sideways swipe: left for the next page, right for the one before', async () => {
  const { paperSwipe, paperDrag } = await import('../src/wall/paper.ts')
  const s = { x: 1000, y: 500, t: 0 }
  assert.equal(paperSwipe(s, { x: 880, y: 520, t: 400 }), 1) // left 120: next
  assert.equal(paperSwipe(s, { x: 1100, y: 490, t: 400 }), -1) // right 100: back
  assert.equal(paperSwipe(s, { x: 1040, y: 500, t: 400 }), 0) // a nudge
  assert.equal(paperSwipe(s, { x: 950, y: 505, t: 150 }), 1) // a quick flick
  assert.equal(paperSwipe(s, { x: 900, y: 650, t: 300 }), 0) // mostly down
  assert.equal(paperSwipe(s, { x: 1000, y: 500, t: 80 }), 0) // a tap
  // It follows the hand once it's clearly sideways; at the first and last page it gives a little, not all the way.
  assert.equal(paperDrag(5, 0, 1, 3), 0)
  assert.equal(paperDrag(-60, 10, 1, 3), -60)
  assert.equal(paperDrag(-60, 80, 1, 3), 0)
  assert.equal(paperDrag(90, 0, 0, 3), 30)
  assert.equal(paperDrag(-90, 0, 2, 3), -30)
})

// Canvas 73A (Jake, Oct 8: "on vertical scroll the cards shrink away as the scroll goes up … as the scroll goes back
// down the cards expand back up" → "i want to try A first, the shrink / expand should be very smooth and very cool
// feeling"): the front page scrolls under a finger with a fling and a soft edge; the cards slim once it moves.
test('the front page scrolls only when its words don’t fit, far enough to clear the slim cards', async () => {
  const { frontScrollMax, PAPER_SLIM_AT } = await import('../src/wall/paper.ts')
  // Everything fits above the full cards: no scrolling, the cards stay full.
  assert.equal(frontScrollMax({ content: 600, view: 900, full: 180, slim: 84 }), 0)
  // Too long with the full cards: it scrolls to the end above the slim ones.
  assert.equal(frontScrollMax({ content: 1000, view: 900, full: 180, slim: 84 }), 1000 + 84 - 900)
  // Fits only once the cards slim: a short scroll, just past the point they slim.
  assert.ok(frontScrollMax({ content: 760, view: 900, full: 180, slim: 84 }) > PAPER_SLIM_AT)
})

test('the fling slows to a stop inside; past an edge it springs back without bouncing past it', async () => {
  const { flingStep, rubberBand } = await import('../src/wall/paper.ts')
  let s = { y: 100, v: 2 } // 2 px/ms down the page
  for (let i = 0; i < 200 && Math.abs(s.v) > 0.005; i++) s = flingStep(s, 16, 1000)
  assert.ok(s.y > 300 && s.y < 1000, `coasted to ${s.y}`)
  assert.ok(Math.abs(s.v) <= 0.005)
  // Let go 90 px past the end: it eases back to the end and stays there.
  s = { y: 1090, v: 0 }
  const seen = []
  for (let i = 0; i < 120; i++) { s = flingStep(s, 16, 1000); seen.push(s.y) }
  assert.ok(Math.abs(s.y - 1000) < 1)
  assert.ok(seen.every((y) => y >= 999.5), 'never back past the edge')
  // Pulled past the top, it gives a third.
  assert.equal(rubberBand(-90, 1000), -30)
  assert.equal(rubberBand(1060, 1000), 1020)
  assert.equal(rubberBand(500, 1000), 500)
})
