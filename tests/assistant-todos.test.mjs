import test from 'node:test'
import assert from 'node:assert/strict'
import { FULL_AI_TOOLS, READ_TOOLS, buildFullAiSystem, fullAiCard } from '../supabase/functions/_shared/assistant-full-ai.mjs'

// Jake's bug report 2026-09-28 9:36 PM: "Add paint the house to my to-do list" → "I can't add things
// to a general to-do list"; then five "When should I remind you?". And: "I'd like Casa to handle a
// natural way of adding a large project to the to-do list." Two cards: a to-do (a date only if he
// gave one) and a project with its steps in order, grown from the reminder if it's already there.
const now = new Date('2026-09-28T21:00:00-04:00')
const events = [{ id: 'paint', title: 'Paint the house', event_type: 'reminder', start_time: '2026-09-28T04:00:00Z', end_time: '2026-09-28T04:15:00Z' }]
const ctx = { events, utcOffset: '-04:00', now, groceries: [], family: [] }

test('two cards: add_todo and plan_project; neither is a read', () => {
  for (const name of ['add_todo', 'plan_project']) {
    assert.ok(FULL_AI_TOOLS.some((t) => t.name === name), name)
    assert.ok(!READ_TOOLS.has(name))
  }
})

test('a to-do needs only a title; a date only when he gave one', () => {
  assert.deepEqual(fullAiCard({ name: 'add_todo', args: { title: ' Fix the gate latch ' } }, ctx), { tool: 'add_todo', args: { title: 'Fix the gate latch', due: null } })
  assert.deepEqual(fullAiCard({ name: 'add_todo', args: { title: 'Paint the house', due: '2026-11-01' } }, ctx).args.due, '2026-11-01')
  assert.equal(fullAiCard({ name: 'add_todo', args: { title: 'x', due: 'November' } }, ctx).args.due, null, 'not a date → no date')
  assert.match(fullAiCard({ name: 'add_todo', args: {} }, ctx).error, /what/i)
})

test('a project: its steps in order with rough time and cost; grown from the reminder already there', () => {
  const card = fullAiCard({ name: 'plan_project', args: {
    title: 'Paint the house', aim_date: '2026-11-26', from_id: 'paint',
    steps: [{ title: 'Get 3 painter quotes', minutes: 30 }, { title: 'Pick colours', minutes: 60, cost: 40 }, { title: '' }, { title: 'Book the painter' }],
  } }, ctx)
  assert.deepEqual(card, { tool: 'plan_project', args: {
    title: 'Paint the house', aim_date: '2026-11-26', from_event_id: 'paint',
    steps: [{ title: 'Get 3 painter quotes', minutes: 30, cost_cents: null }, { title: 'Pick colours', minutes: 60, cost_cents: 4000 }, { title: 'Book the painter', minutes: null, cost_cents: null }],
  } })
  assert.equal(fullAiCard({ name: 'plan_project', args: { title: 'X', from_id: 'nope', steps: [{ title: 'a' }, { title: 'b' }] } }, ctx).args.from_event_id, null, 'only a real reminder')
  assert.match(fullAiCard({ name: 'plan_project', args: { title: 'X', steps: [] } }, ctx).error, /step/i)
})

test('the assistant knows his words: reminders have a time, to-dos may not, projects have steps', () => {
  const system = buildFullAiSystem({ family: [], events: [], groceries: [], pending: [], onScreenIds: [], utcOffset: '-04:00', now })
  assert.match(system, /to-do list/i)
  assert.match(system, /plan_project/)
  assert.match(system, /add_todo/)
  assert.match(system, /never ask when/i)
})

// Live check 2026-09-28: "Add paint the house to my to-do list" added a second one (his is due Nov 1,
// outside the three weeks it's shown), and "New home project: redo the floorboards" asked HIM for the
// steps. It sees his open to-do list, and proposes the steps itself.
test('the assistant sees his open to-do list, and a project grows from an item on it', () => {
  const todos = [{ id: 'paint', title: 'Paint the house', due: '2026-11-01' }, { id: 'gfi', title: 'Replace the outside GFI outlet', due: null }]
  const system = buildFullAiSystem({ family: [], events: [], groceries: [], pending: [], onScreenIds: [], utcOffset: '-04:00', now, todos })
  assert.match(system, /TO-DO LIST[^\n]*\n- \[paint\] Paint the house · by Sun Nov 1\n- \[gfi\] Replace the outside GFI outlet/)
  assert.match(system, /already on (it|the list|his list)/i)
  const card = fullAiCard({ name: 'plan_project', args: { title: 'Paint the house', from_id: 'paint', steps: [{ title: 'a' }, { title: 'b' }] } }, { ...ctx, events: [], todos })
  assert.equal(card.args.from_event_id, 'paint')
})

test('a project\'s steps come from Casa, not from questions to him', () => {
  const tool = FULL_AI_TOOLS.find((t) => t.name === 'plan_project')
  assert.match(tool.description, /never ask him for the steps/i)
})

// Live 2026-09-28: "modify that project" made a second project; "I wanna delete this one" → "Okay,
// I'll discard that project plan" — nothing was deleted. It sees his saved projects, and it's told
// plainly that saved ones change on the To do screen (for now), never "done" without a saved card.
test('the assistant sees saved projects and never claims a change it cannot make', () => {
  const projects = [{ id: 'p1', title: 'Paint the house', done: 0, total: 9, next: 'Fix cracks' }]
  const system = buildFullAiSystem({ family: [], events: [], groceries: [], pending: [], onScreenIds: [], utcOffset: '-04:00', now, projects })
  assert.match(system, /PROJECTS[^\n]*\n- (\[[^\]]+\] )?Paint the house · 0 of 9 steps done · next: Fix cracks/)
  assert.match(system, /To do screen/)
  assert.match(system, /never say .*(changed|deleted|done)/i)
})

// Jake's bug report, Oct 1 (wall band): "nothing on todos or reminders?" → "two reminders today: Work on Olivia's
// dedication page at 8:00 AM … and Kelly to Gym at 7:30 PM" — the gym is a calendar event, and the chores (trash,
// meds) never came up: Casa didn't know them. To-dos and reminders come from his To Do list and the chores.
test('"anything on my to-dos or reminders?": the To Do list with times, today\'s chores, and events are never reminders', () => {
  const at = new Date('2026-10-01T15:00:00-04:00')
  const system = buildFullAiSystem({
    ...ctx, now: at,
    todos: [
      { id: 't1', title: "Work on Olivia's dedication page", due: '2026-10-01', time: '8:00 AM', late: true },
      { id: 't2', title: 'Fix the gate latch', due: null },
    ],
    chores: [
      { title: 'Trash to the street', who: 'Jake', days: [1, 4], time: '20:00:00', today: false, done: false },
      { title: 'Take meds', who: 'Liv', days: [1, 2, 3, 4, 5], time: '18:00:00', today: true, done: false },
    ],
  })
  assert.match(system, /\[t1\] Work on Olivia's dedication page · by Thu Oct 1, 8:00 AM \(late\)/)
  assert.match(system, /\[t2\] Fix the gate latch\n/)
  assert.match(system, /CHORES[^\n]*\n- Trash to the street · Jake · Mon & Thu, 8 PM\n- Take meds · Liv · Mon–Fri, 6 PM · today, not done yet/)
  assert.match(system, /never call a calendar event a reminder/i)
  assert.match(system, /asked what's on (his|their) to-dos or reminders[^.]*TO-DO LIST[^.]*CHORES/i)
})

test('the chores Casa is told: who, when, and whether today\'s is done — every-other-week ones only on their weeks', async () => {
  const { choresForCasa } = await import('../supabase/functions/_shared/assistant-full-ai.mjs')
  const family = [{ id: 'j', name: 'Jake' }, { id: 'l', name: 'Liv' }, { id: 'o', name: 'Owen' }]
  const rows = [
    { id: 'trash', title: 'Trash to the street', member_id: 'j', days_of_week: [1, 4], time_local: '20:00:00', enabled: true, every_weeks: 1, starts_on: '2026-10-01' },
    { id: 'meds', title: 'Take meds', member_id: 'l', days_of_week: [1, 2, 3, 4, 5], time_local: '18:00:00', enabled: true, every_weeks: 1, starts_on: '2026-10-01' },
    // Every 4 weeks on Sunday from Sun Oct 4: Oct 4, Nov 1 — not Oct 11.
    { id: 'litter', title: 'Change the cat litter', member_id: 'o', days_of_week: [0], time_local: '10:00:00', enabled: true, every_weeks: 4, starts_on: '2026-10-02' },
  ]
  const thu = choresForCasa(rows, new Set(['trash']), family, '2026-10-01')
  assert.deepEqual(thu.map((c) => [c.title, c.who, c.today, c.done]), [['Trash to the street', 'Jake', true, true], ['Take meds', 'Liv', true, false], ['Change the cat litter', 'Owen', false, false]])
  assert.equal(choresForCasa(rows, new Set(), family, '2026-10-04').find((c) => c.title.startsWith('Change')).today, true)
  assert.equal(choresForCasa(rows, new Set(), family, '2026-10-11').find((c) => c.title.startsWith('Change')).today, false)
  assert.equal(choresForCasa(rows, new Set(), family, '2026-11-01').find((c) => c.title.startsWith('Change')).today, true)
})

test('a to-do for Casa: its day, its time (midnight is a day without one), and whether it\'s late', async () => {
  const { todoForCasa } = await import('../supabase/functions/_shared/assistant-full-ai.mjs')
  const now = new Date('2026-10-03T15:00:00-04:00')
  assert.deepEqual(todoForCasa({ id: 'a', title: 'Dedication page', has_due_date: true, all_day: false, start_time: '2026-10-03T13:00:00-04:00' }, now), { id: 'a', title: 'Dedication page', due: '2026-10-03', time: '1:00 PM', late: true })
  assert.deepEqual(todoForCasa({ id: 'b', title: 'Costume', has_due_date: true, all_day: false, start_time: '2026-10-04T00:00:00-04:00' }, now), { id: 'b', title: 'Costume', due: '2026-10-04', time: null, late: false }, 'midnight: the day only')
  assert.deepEqual(todoForCasa({ id: 'c', title: 'Fix cracks', has_due_date: true, all_day: true, start_time: '2026-09-28T04:00:00Z' }, now), { id: 'c', title: 'Fix cracks', due: '2026-09-28', time: null, late: true })
  assert.deepEqual(todoForCasa({ id: 'd', title: 'Gate latch', has_due_date: false, all_day: false, start_time: '2026-10-03T04:00:00Z' }, now), { id: 'd', title: 'Gate latch', due: null, time: null, late: false })
  assert.equal(todoForCasa({ id: 'e', title: 'Today, no time', has_due_date: true, all_day: true, start_time: '2026-10-03T04:00:00Z' }, now).late, false, 'due today with no time is not late yet')
})

test('a to-do on the calendar at midnight is listed as its day, with no time', () => {
  const system = buildFullAiSystem({ ...ctx, now: new Date('2026-10-03T15:00:00-04:00'), events: [
    { id: 'x', title: 'Costume', event_type: 'reminder', start_time: '2026-10-04T04:00:00Z', end_time: '2026-10-04T04:15:00Z' },
    { id: 'y', title: 'Call the vet', event_type: 'reminder', start_time: '2026-10-04T13:00:00Z', end_time: '2026-10-04T13:15:00Z' },
  ] })
  assert.match(system, /\[x\] Sun Oct 4, no set time · Costume · reminder/)
  assert.match(system, /\[y\] Sun Oct 4, 9:00 AM–9:15 AM · Call the vet · reminder/)
})
