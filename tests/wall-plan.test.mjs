import test from 'node:test'
import assert from 'node:assert/strict'
import { planSections, planChange, planCount, savedRows, agreeGroups } from '../src/wall/plan.ts'

// Plan it with Casa (P3.25 phase 3; canvas 12b–12d, approved by Jake 2026-09-29): the draft beside the
// conversation, one card with ticks, and what was saved — each opening where it lives.

const project = { id: 'i1', kind: 'project', title: 'Emme — light-up jellyfish', part_of: 'Halloween costumes', part_of_project_id: 'p1', why: 'Inside your costumes.',
  steps: [{ title: 'Buy the parts', minutes: 30, cost_cents: 4500 }, { title: 'Build night', minutes: 120, who: 'Jake + Emme', cal_start: '2026-10-17' }] }
const items = [
  project,
  { id: 'i2', kind: 'tick_step', project_id: 'p1', step_id: 's1', title: 'Ask the kids what they want to be', project: 'Halloween costumes', why: 'Emme picked the jellyfish.' },
  { id: 'i3', kind: 'shopping', name: 'Clear dome umbrella' },
  { id: 'i4', kind: 'shopping', name: 'Battery fairy lights, 2 strands' },
  { id: 'i5', kind: 'event', title: 'Trick-or-treat', start: '2026-10-31T18:00:00-04:00', end: '2026-10-31T20:00:00-04:00' },
  { id: 'i6', kind: 'pack', label: 'Spare AA batteries', event_ref: 'i5', event_title: 'Trick-or-treat' },
  { id: 'i7', kind: 'todo', title: 'Charge the fairy lights', due: '2026-10-30' },
]

test('the draft reads in sections, in the order you’d do them (board 12b)', () => {
  const s = planSections(items)
  assert.deepEqual(s.map((x) => x.heading), ['STEPS', 'SHOPPING', 'ON THE CALENDAR', 'TO DO', 'PACK'])
  const steps = s[0]
  assert.equal(steps.intro, 'A project inside Halloween costumes')
  assert.deepEqual(steps.lines.map((l) => [l.text, l.meta, l.done ?? false]), [
    ['Ask the kids what they want to be', 'ticks off', true],
    ['Buy the parts', '30 min · $45', false],
    ['Build night', 'Sat, Oct 17 · Jake + Emme · 2 hr', false],
  ])
  assert.deepEqual(s[2].lines.map((l) => [l.text, l.meta]), [['Trick-or-treat', 'Sat, Oct 31 · 6–8 PM'], ['Build night', 'Sat, Oct 17 · a step']])
  assert.deepEqual(s[4].lines.map((l) => [l.text, l.meta]), [['Spare AA batteries', 'for Trick-or-treat']])
})

test('what just changed is named and marked (board 12b)', () => {
  const before = items.map((i) => (i.kind === 'project' ? { ...i, steps: [i.steps[0], { ...i.steps[1], cal_start: '2026-10-16' }] } : i)).filter((i) => i.id !== 'i7')
  const change = planChange(before, items)
  assert.equal(change.line, 'Just changed: Build night → Sat, Oct 17 · added “Charge the fairy lights”')
  assert.ok(change.marked.has('step:Build night'))
  assert.ok(change.marked.has('todo:Charge the fairy lights'))
  assert.equal(planChange(null, items).line, null, 'the first draft marks nothing')
})

test('counting what saves: things, and the places they land', () => {
  assert.equal(planCount(items, []).label, '7 things, in 5 places', 'each line on the card is a thing')
  assert.equal(planCount(items, ['i3', 'i4']).things, 5)
})

test('the Agree card groups by where each thing lands, each with its own tick (board 12c)', () => {
  const g = agreeGroups(items)
  assert.deepEqual(g.map((x) => x.heading), ['PROJECT · INSIDE HALLOWEEN COSTUMES', 'CALENDAR · AND GOOGLE', 'SHOPPING LIST', 'TO DO', 'PACK'])
  assert.deepEqual(g[0].rows.map((r) => [r.id, r.label, r.meta]), [
    ['i1', 'Emme — light-up jellyfish', '2 steps'],
    ['i2', 'Tick off “Ask the kids what they want to be”', 'done'],
  ])
  assert.deepEqual(g[1].rows.map((r) => [r.id, r.label, r.meta]), [['i5', 'Trick-or-treat', 'Sat, Oct 31 · 6–8 PM']])
})

test('saved: each line opens where it lives (board 12d)', () => {
  const result = { links: [
    { id: 'i1', kind: 'project', project_id: 'np1' },
    { id: 'i2', kind: 'tick_step', project_id: 'p1' },
    { id: 'i3', kind: 'shopping' }, { id: 'i4', kind: 'shopping' },
    { id: 'i5', kind: 'event', event_id: 'ne1', start: '2026-10-31T18:00:00-04:00' },
    { id: 'i6', kind: 'pack', event_id: 'ne1' },
  ] }
  const { rows, left } = savedRows(items, result, ['i7'])
  assert.deepEqual(rows.map((r) => [r.label, r.open]), [
    ['Emme — light-up jellyfish · 2 steps, inside Halloween costumes', { kind: 'project', id: 'np1', label: 'Open project' }],
    ['“Ask the kids what they want to be” ticked off', { kind: 'project', id: 'p1', label: 'Open project' }],
    ['Trick-or-treat · Sat, Oct 31 · 6–8 PM · on Google too', { kind: 'event', id: 'ne1', label: 'See Oct 31' }],
    ['2 lines on the shopping list', { kind: 'shopping', label: 'Shopping list' }],
    ['Pack for Trick-or-treat: Spare AA batteries', { kind: 'event', id: 'ne1', label: 'See Oct 31' }],
  ])
  assert.deepEqual(left, ['Charge the fairy lights'])
})

test('an event left out takes its pack lines with it', async () => {
  const { withDependents } = await import('../src/wall/plan.ts')
  assert.deepEqual(withDependents(items, ['i5']), ['i5', 'i6'])
  assert.deepEqual(withDependents(items, ['i3']), ['i3'])
})

// "Where did the plan steps go?" (Owen's costume, 2026-09-29): what a revision took off is named, briefly;
// what changed or was added shows only as the tan on its line.
test('what a revision took off is named, nothing else', () => {
  const before = items
  const after = items.filter((i) => i.id !== 'i3' && i.id !== 'i7')
  assert.deepEqual(planChange(before, after).removed, ['Clear dome umbrella', 'Charge the fairy lights'])
  assert.deepEqual(planChange(null, after).removed, [])
})

// Phase 4 (P3.25): changes to a saved project, and a project replaced ("changed to Chucky").
const changes = [
  { id: 'i1', kind: 'close_project', project_id: 'p-scuba', title: 'Liv — scuba diver', reason: 'Changed to Chucky', open_steps: 2 },
  { id: 'i2', kind: 'project', title: 'Liv — Chucky', part_of: 'Halloween costumes', part_of_project_id: 'p1', steps: [{ title: 'Buy overalls' }] },
  { id: 'i3', kind: 'edit_step', project_id: 'p-jelly', step_id: 's1', project: 'Emme — jellyfish', title: 'Build night', changes: { cal_start: '2026-10-18', who: 'Kelly' } },
  { id: 'i4', kind: 'add_step', project_id: 'p-jelly', project: 'Emme — jellyfish', title: 'Paint the tentacles', after: 'Build night', changes: { minutes: 45 } },
  { id: 'i5', kind: 'remove_step', project_id: 'p-jelly', step_id: 's2', project: 'Emme — jellyfish', title: 'Fitting' },
]

test('the draft shows what closes, and each change to a saved project in its words', () => {
  const s = planSections(changes)
  assert.deepEqual(s.map((x) => x.heading), ['CLOSING', 'STEPS', 'CHANGES TO EMME — JELLYFISH'])
  assert.deepEqual(s[0].lines.map((l) => [l.text, l.meta, l.struck ?? false]), [['Liv — scuba diver', 'Changed to Chucky · 2 steps not done come off', true]])
  assert.deepEqual(s[2].lines.map((l) => [l.text, l.meta, l.struck ?? false]), [
    ['Build night', '→ Sun, Oct 18 · Kelly', false],
    ['+ Paint the tentacles', 'after Build night · 45 min', false],
    ['Fitting', 'comes off', true],
  ])
})

test('the Agree card takes off first, then adds, then changes — a tick each', () => {
  const g = agreeGroups(changes)
  assert.deepEqual(g.map((x) => x.heading), ['TAKING OFF', 'PROJECT · INSIDE HALLOWEEN COSTUMES', 'CHANGES TO EMME — JELLYFISH'])
  assert.deepEqual(g[0].rows.map((r) => [r.id, r.label, r.meta]), [['i1', 'Close Liv — scuba diver', 'Changed to Chucky']])
  assert.deepEqual(g[2].rows.map((r) => [r.id, r.label, r.meta]), [
    ['i3', 'Build night → Sun, Oct 18 · Kelly', ''],
    ['i4', 'Add “Paint the tentacles”', 'after Build night'],
    ['i5', 'Remove “Fitting”', ''],
  ])
})

test('saved: a closed project and a changed one each open where they live', () => {
  const { rows } = savedRows(changes, { links: [
    { id: 'i1', kind: 'close_project', project_id: 'p-scuba' }, { id: 'i2', kind: 'project', project_id: 'p-chucky' },
    { id: 'i3', kind: 'edit_step', project_id: 'p-jelly' }, { id: 'i4', kind: 'add_step', project_id: 'p-jelly' }, { id: 'i5', kind: 'remove_step', project_id: 'p-jelly' },
  ] }, [])
  assert.deepEqual(rows.map((r) => [r.label, r.open?.id ?? null]), [
    ['Liv — scuba diver closed · Changed to Chucky', 'p-scuba'],
    ['Liv — Chucky · 1 step, inside Halloween costumes', 'p-chucky'],
    ['Emme — jellyfish: 3 changes', 'p-jelly'],
  ])
})

test('a move reads as where the step goes, on the draft and the Agree card', () => {
  const moves = [
    { id: 'i1', kind: 'move_step', project_id: 'p-paint', step_id: 's1', project: 'Paint the house', title: 'Hire the painter', after_step_id: 's2', after: 'Fix the stucco' },
    { id: 'i2', kind: 'move_step', project_id: 'p-paint', step_id: 's3', project: 'Paint the house', title: 'Get quotes' },
  ]
  assert.deepEqual(planSections(moves)[0].lines.map((l) => [l.text, l.meta]), [['Hire the painter', '→ after Fix the stucco'], ['Get quotes', '→ first']])
  assert.deepEqual(agreeGroups(moves)[0].rows.map((r) => [r.label, r.meta]), [['Move “Hire the painter”', 'after Fix the stucco'], ['Move “Get quotes”', 'to the start']])
  assert.equal(planCount(moves, []).label, '2 things, in 1 place')
})

// P3.24: a photo's details for an event already on the calendar (board 12f: "Add to Owen's field trip, Thu").
test('details for an event already there read as what gets added to it, on the draft, the Agree card and Saved', () => {
  const items = [
    { id: 'i1', kind: 'event_details', event_id: 'e-trip', title: 'Field trip', changes: { start: '2026-10-01T09:30:00-04:00', end: '2026-10-01T12:00:00-04:00', place: 'Glazer Hall', notes: 'By bus. Questions: Kim Kerry (561) 329-1269', people: ['Owen'] } },
    { id: 'i2', kind: 'pack', label: 'Neon pink shirt', for_event: 'e-trip', event_id: 'e-trip', event_title: 'Field trip' },
  ]
  const s = planSections(items)
  assert.equal(s[0].heading, 'ADD TO FIELD TRIP')
  assert.deepEqual(s[0].lines.map((l) => [l.text, l.meta]), [
    ['Thu, Oct 1 · 9:30 AM–12 PM', 'the time'], ['Glazer Hall', 'the place'], ['Owen', 'going'], ['By bus. Questions: Kim Kerry (561) 329-1269', 'in the notes'],
  ])
  const g = agreeGroups(items)
  assert.deepEqual(g[0].heading, 'CALENDAR · ADDING TO WHAT’S THERE')
  assert.deepEqual(g[0].rows.map((r) => [r.id, r.label, r.meta]), [['i1', 'Add to “Field trip”', 'Thu, Oct 1 · 9:30 AM–12 PM · Glazer Hall · Owen']])
  assert.equal(planCount(items, []).label, '2 things, in 2 places')
  const { rows } = savedRows(items, { links: [{ id: 'i1', kind: 'event_details', event_id: 'e-trip' }] }, [])
  assert.deepEqual(rows[0], { label: 'Field trip · details added · on Google too', open: { kind: 'event', id: 'e-trip', label: 'See Oct 1' } })
})
