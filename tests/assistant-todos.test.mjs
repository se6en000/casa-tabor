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
