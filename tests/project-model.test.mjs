import test from 'node:test'
import assert from 'node:assert/strict'
import { shelfCard, hoursText, planGroups, doneSteps, arrangement, moveStep, nudgeStep, placeNew, dropTargetAt, effortText, moneyText, projectStats, whoOptions } from '../src/wall/projectModel.ts'

// The project page (P3.23, canvas 10b/10c, approved by Jake 2026-09-29): top to bottom is the order;
// steps side by side share a group; "Then" lines separate groups. Jake: "it should be very easy to
// review and change the order, add a step in realtime on the same screen".
const step = (id, grp, extra = {}) => ({ id, position: 0, grp, title: id, minutes: null, cost_cents: null, done_at: null, reminder_event_id: null, who: null, fits: [], repeat_minutes: null, repeat_count: null, repeat_unit: null, notes: null, cal_start: null, cal_end: null, shop_item: null, child_project_id: null, child: null, ...extra })
const project = (extra = {}) => ({ id: 'p', title: 'Paint the house', aim_date: '2026-11-21', aim_firm: false, budget_cents: 800000, people: [{ name: 'Me' }, { name: 'Kelly' }, { name: 'Gomez Painting', role: 'Painter' }], phone: 'next', yearly: false, season_id: null, status: 'active', paused_until: null, notes: null, created_at: '2026-09-20T12:00:00Z', ...extra })
const PAINT = {
  project: project(),
  steps: [
    step('decide', 1, { done_at: '2026-09-21T12:00:00Z' }),
    step('walk', 2, { done_at: '2026-09-22T12:00:00Z' }),
    step('quotes', 3, { done_at: '2026-09-24T12:00:00Z' }),
    step('colours', 4, { minutes: 60, cost_cents: 4000, who: 'Me' }),
    step('stucco', 4, { child_project_id: 'c', child: { id: 'c', title: 'Stucco cracks', done: 1, total: 4, next: 'Mario’s quote', status: 'active' } }),
    step('choose', 5, { minutes: 30, who: 'Me' }),
    step('patio', 6, { minutes: 60, who: 'Kelly' }),
    step('shutters', 6, { minutes: 60, who: 'Me' }),
    step('painter', 7, { minutes: 2400, cost_cents: 600000, who: 'Gomez Painting' }),
    step('touch', 8, { minutes: 60 }),
  ].map((s, i) => ({ ...s, position: i + 1 })),
}
const ids = (groups) => groups.map((g) => g.map((s) => (typeof s === 'string' ? s : s.id)))

test('the plan: open steps in groups, top to bottom; done ones apart', () => {
  assert.deepEqual(ids(planGroups(PAINT)), [['colours', 'stucco'], ['choose'], ['patio', 'shutters'], ['painter'], ['touch']])
  assert.deepEqual(doneSteps(PAINT).map((s) => s.id), ['decide', 'walk', 'quotes'])
  // What the page sends: done ones first, in order, then the plan as shown.
  assert.deepEqual(arrangement(PAINT, [['choose'], ['colours', 'stucco']]), [['decide'], ['walk'], ['quotes'], ['choose'], ['colours', 'stucco']])
})

test('drag: onto a row joins its group there; onto a Then line makes a group of its own', () => {
  const groups = ids(planGroups(PAINT))
  // "Take down shutters" dragged beside "Choose the painter" (the board's mid-drag state).
  assert.deepEqual(moveStep(groups, 'shutters', { kind: 'join', group: 1, index: 1 }), [['colours', 'stucco'], ['choose', 'shutters'], ['patio'], ['painter'], ['touch']])
  // Onto the Then line above the painter: its own group, just before him.
  assert.deepEqual(moveStep(groups, 'choose', { kind: 'new', at: 3 }), [['colours', 'stucco'], ['patio', 'shutters'], ['choose'], ['painter'], ['touch']])
  // To the very top.
  assert.deepEqual(moveStep(groups, 'touch', { kind: 'new', at: 0 }), [['touch'], ['colours', 'stucco'], ['choose'], ['patio', 'shutters'], ['painter']])
  // Dropped where it was: nothing changes.
  assert.deepEqual(moveStep(groups, 'choose', { kind: 'join', group: 1, index: 0 }), groups)
})

test('↑ / ↓ (the fallback): out of a shared group first, then into the group beside', () => {
  const groups = ids(planGroups(PAINT))
  // Shutters shares a group: ↑ gives it a group of its own just above.
  assert.deepEqual(nudgeStep(groups, 'shutters', 'up'), [['colours', 'stucco'], ['choose'], ['shutters'], ['patio'], ['painter'], ['touch']])
  // Alone: ↑ joins the group above.
  assert.deepEqual(nudgeStep(groups, 'choose', 'up'), [['colours', 'stucco', 'choose'], ['patio', 'shutters'], ['painter'], ['touch']])
  assert.deepEqual(nudgeStep(groups, 'painter', 'down'), [['colours', 'stucco'], ['choose'], ['patio', 'shutters'], ['painter', 'touch']])
  // Already at the top, alone: nowhere to go.
  assert.deepEqual(nudgeStep([['a'], ['b']], 'a', 'up'), [['a'], ['b']])
})

test('+ Add here: a new step in its own group on a Then line, or beside a step', () => {
  const groups = [['a'], ['b', 'c'], ['d']]
  assert.deepEqual(placeNew(groups, { kind: 'new', at: 2 }), [['a'], ['b', 'c'], ['@new'], ['d']])
  assert.deepEqual(placeNew(groups, { kind: 'join', group: 1, index: 1 }), [['a'], ['b', '@new', 'c'], ['d']])
})

test('where a drag lands, from the finger’s height', () => {
  const rows = [
    { group: 0, index: 0, top: 100, bottom: 160 }, { group: 0, index: 1, top: 160, bottom: 220 },
    { group: 1, index: 0, top: 264, bottom: 324 },
  ]
  const lines = [{ at: 1, top: 220, bottom: 264 }]
  assert.deepEqual(dropTargetAt(240, rows, lines, 2), { kind: 'new', at: 1 })
  assert.deepEqual(dropTargetAt(170, rows, lines, 2), { kind: 'join', group: 0, index: 1 })
  assert.deepEqual(dropTargetAt(210, rows, lines, 2), { kind: 'join', group: 0, index: 2 })
  assert.deepEqual(dropTargetAt(40, rows, lines, 2), { kind: 'new', at: 0 })
  assert.deepEqual(dropTargetAt(500, rows, lines, 2), { kind: 'new', at: 2 })
})

test('effort and money the way the board says them', () => {
  assert.equal(effortText(20), '20 min')
  assert.equal(effortText(60), '1 hr')
  assert.equal(effortText(200), '3 hr 20')
  assert.equal(effortText(480), '1 day')
  assert.equal(effortText(2400), '5 days')
  assert.equal(effortText(null), '')
  assert.equal(moneyText(600000), '$6,000')
  assert.equal(moneyText(4000), '$40')
})

test('the totals across the top: steps, your time and theirs, money against the budget, the target and your pace', () => {
  const s = projectStats(PAINT, '2026-09-29')
  assert.equal(s.done, 3)
  assert.equal(s.total, 9)
  assert.deepEqual(s.inside, [{ title: 'Stucco cracks', done: 1, total: 4 }])
  // Yours: the household's (anyone without a trade); theirs by their trade.
  assert.equal(s.yourMinutes, 60 + 30 + 60 + 60 + 60)
  assert.deepEqual(s.theirs, [{ who: 'Painter', minutes: 2400 }])
  assert.equal(s.moneyLeft, 604000)
  assert.equal(s.budget, 800000)
  assert.equal(s.daysLeft, 53)
  // 3 steps in 9 days: 7 left (6 steps and the project inside) → 21 more days.
  assert.equal(s.finish, '2026-10-20')
  assert.equal(s.lateBy, 0)
  // Nothing done yet: no pace to judge.
  assert.equal(projectStats({ ...PAINT, steps: PAINT.steps.map((x) => ({ ...x, done_at: null })) }, '2026-09-29').finish, null)
})

test('who can do a step: this project’s people', () => {
  assert.deepEqual(whoOptions(PAINT.project), ['Me', 'Kelly', 'Gomez Painting'])
  assert.deepEqual(whoOptions(project({ people: [] })), ['Me'])
})

import { applyProjectEdit } from '../src/wall/projectModel.ts'

test('the fixture edits the way the database does: arrange, add here, a project inside, details, settings, status', () => {
  let d = applyProjectEdit(PAINT, 'arrange', { groups: arrangement(PAINT, [['colours', 'stucco'], ['choose', 'shutters'], ['patio'], ['painter'], ['touch']]) })
  assert.deepEqual(ids(planGroups(d)), [['colours', 'stucco'], ['choose', 'shutters'], ['patio'], ['painter'], ['touch']])
  d = applyProjectEdit(d, 'add_step', { title: 'Buy tarps', arrange: arrangement(d, placeNew(ids(planGroups(d)), { kind: 'new', at: 3 })) })
  assert.deepEqual(planGroups(d).map((g) => g.map((s) => s.title)), [['colours', 'stucco'], ['choose', 'shutters'], ['patio'], ['Buy tarps'], ['painter'], ['touch']])
  d = applyProjectEdit(d, 'set_step', { step_id: 'shutters', repeat_minutes: 20, repeat_count: 10, repeat_unit: 'shutters', who: 'Kelly', fits: ['weekends'], cost_cents: 2500 })
  const shutters = d.steps.find((s) => s.id === 'shutters')
  assert.equal(shutters.minutes, 200)
  assert.equal(shutters.who, 'Kelly')
  assert.deepEqual(shutters.fits, ['weekends'])
  d = applyProjectEdit(d, 'take_out', { step_id: 'stucco' })
  assert.equal(d.steps.some((s) => s.child_project_id), false)
  d = applyProjectEdit({ ...d, others: [{ id: 'c', title: 'Stucco cracks' }] }, 'add_child', { project_id: 'c' })
  assert.equal(planGroups(d).at(-1)[0].child.title, 'Stucco cracks')
  d = applyProjectEdit(d, 'settings', { phone: 'now', budget_cents: 900000, yearly: true })
  assert.equal(d.project.phone, 'now')
  assert.equal(d.project.budget_cents, 900000)
  d = applyProjectEdit(d, 'status', { status: 'paused', until: '2026-10-15' })
  assert.equal(d.project.paused_until, '2026-10-15')
})

// The shelf on the To do list (canvas 10a): one card per project, from the same numbers as its page.
test('a shelf card: a segment per step, steps and your time and money, the target and your pace, what’s Now, a project inside', () => {
  const c = shelfCard(PAINT, '2026-09-29')
  assert.equal(c.kind, 'PROJECT')
  assert.deepEqual(c.segments, ['done', 'done', 'done', 'now', 'inside', 'later', 'later', 'later', 'later', 'later'])
  assert.equal(c.stats, '3 of 9 steps · ~4.5 hr yours · $6,040 left')
  assert.equal(c.target, 'Target Sat, Nov 21 · 53 days')
  assert.deepEqual(c.pace, { text: 'On pace: Oct 20', late: false })
  assert.deepEqual(c.now, ['colours'])
  assert.deepEqual(c.inside, { title: 'Stucco cracks', done: 1, total: 4 })
  const late = shelfCard({ ...PAINT, project: { ...PAINT.project, aim_date: '2026-10-10' } }, '2026-09-29')
  assert.deepEqual(late.pace, { text: 'At your pace: Oct 20, 10 days late', late: true })
  assert.equal(shelfCard({ ...PAINT, project: { ...PAINT.project, yearly: true } }, '2026-09-29').kind, 'EVERY YEAR')
  assert.equal(shelfCard({ ...PAINT, project: { ...PAINT.project, status: 'paused', paused_until: '2026-10-15' } }, '2026-09-29').kind, 'PAUSED UNTIL OCT 15')
})

test('totals in hours: 48 hours of work is "48 hr", not "6 days"', () => {
  assert.equal(hoursText(2880), '48 hr')
  assert.equal(hoursText(270), '4.5 hr')
  assert.equal(hoursText(45), '45 min')
})
