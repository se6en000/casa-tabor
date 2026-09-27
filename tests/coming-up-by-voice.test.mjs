import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { FULL_AI_TOOLS, READ_TOOLS, comingUpForModel, fullAiCard } from '../supabase/functions/_shared/assistant-full-ai.mjs'

// Coming up by voice (FAMILY_WALL_PLAN.md P3.19; Jake 2026-09-27: "a way to easily mark it so it goes
// on the list … how could that be done?" → "Sure, let's do that"). Three things, each a card:
// put one event on the list, an "every time" rule, and done / snooze / not needed.
const events = [{ id: 'spirit', title: "St. Patrick's Spirit Day", start_time: '2026-10-16T12:00:00Z', end_time: '2026-10-16T12:30:00Z', all_day: false, people: ['Emme', 'Owen'], drivers: [] }]
const ctx = { events, utcOffset: '-04:00', now: new Date('2026-09-27T12:00:00-04:00'), groceries: [], family: [] }

test('the tools: three cards and a lookup', () => {
  for (const name of ['add_to_coming_up', 'add_coming_up_rule', 'change_coming_up_item', 'get_coming_up']) assert.ok(FULL_AI_TOOLS.some((t) => t.name === name), name)
  assert.ok(READ_TOOLS.has('get_coming_up'))
  assert.ok(!READ_TOOLS.has('add_coming_up_rule'))
})

test('putting one event on the list: its step and how many days of notice', () => {
  assert.deepEqual(fullAiCard({ name: 'add_to_coming_up', args: { id: 'spirit', step: 'Green shirts for Emme and Owen', notice_days: 5 } }, ctx),
    { tool: 'add_to_coming_up', args: { id: 'spirit', title: "St. Patrick's Spirit Day", step: 'Green shirts for Emme and Owen', notice_days: 5 } })
  assert.match(fullAiCard({ name: 'add_to_coming_up', args: { id: 'nope', step: 'x', notice_days: 5 } }, ctx).error, /calendar/)
  assert.match(fullAiCard({ name: 'add_to_coming_up', args: { id: 'spirit', step: '', notice_days: 5 } }, ctx).error, /get ready/)
  assert.equal(fullAiCard({ name: 'add_to_coming_up', args: { id: 'spirit', step: 'x', notice_days: 500 } }, ctx).args.notice_days, 120, 'at most four months')
})

test('an "every time" rule: words to match, and a step, a notice, or off', () => {
  assert.deepEqual(fullAiCard({ name: 'add_coming_up_rule', args: { match: ' Spirit Day ', step: 'Themed shirts for Emme and Owen', notice_days: 5 } }, ctx),
    { tool: 'add_coming_up_rule', args: { match: 'spirit day', step: 'Themed shirts for Emme and Owen', notice_days: 5, off: false } })
  assert.deepEqual(fullAiCard({ name: 'add_coming_up_rule', args: { match: 'dentist', off: true } }, ctx),
    { tool: 'add_coming_up_rule', args: { match: 'dentist', step: null, notice_days: null, off: true } })
  assert.match(fullAiCard({ name: 'add_coming_up_rule', args: { match: '', step: 'x' } }, ctx).error, /words/)
  assert.match(fullAiCard({ name: 'add_coming_up_rule', args: { match: 'trips' } }, ctx).error, /step|notice|off/)
})

test('done, snooze a week, not needed', () => {
  assert.deepEqual(fullAiCard({ name: 'change_coming_up_item', args: { id: 'spirit', action: 'snooze' } }, ctx), { tool: 'change_coming_up_item', args: { id: 'spirit', title: "St. Patrick's Spirit Day", action: 'snooze' } })
  assert.match(fullAiCard({ name: 'change_coming_up_item', args: { id: 'spirit', action: 'explode' } }, ctx).error, /done/)
})

test('saved on a yes; the rules and notices are stored server-side; the digest reads them', () => {
  const action = readFileSync(new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url), 'utf8')
  for (const t of ['add_to_coming_up', 'add_coming_up_rule', 'change_coming_up_item']) assert.match(action, new RegExp(`tool === '${t}'[^\\n]*\\) \\{`))
  const sql = readFileSync(new URL('../supabase/migrations/20260927240000_coming_up_by_voice.sql', import.meta.url), 'utf8')
  assert.match(sql, /add column if not exists custom_step text/)
  assert.match(sql, /create table if not exists public\.coming_up_rules/)
  assert.match(sql, /alter table public\.coming_up_rules enable row level security/)
  const fn = readFileSync(new URL('../supabase/functions/coming-up/index.ts', import.meta.url), 'utf8')
  assert.match(fn, /from\('coming_up_rules'\)/)
  assert.match(fn, /buildComingUp\(\{[^}]*rules/)
})

test('the rule uses the fewest words, and questions about the list go to the full assistant', () => {
  const rule = FULL_AI_TOOLS.find((t) => t.name === 'add_coming_up_rule')
  assert.match(rule.parameters.properties.match.description, /fewest words/)
  const reader = readFileSync(new URL('../supabase/functions/_shared/assistant-turn-context.mjs', import.meta.url), 'utf8')
  assert.match(reader, /asking what's on the Coming up list, or about gift ideas, is "other"/)
})

test('read out briefly: what to start within two weeks, how many more, and the rules', () => {
  const items = [
    { key: 'a', title: 'AC appointment', date: '2026-09-30', daysAway: 3, nextStep: 'Make sure it works with work', pokeOn: '2026-09-23', late: true },
    { key: 'b', title: 'Columbus Day', date: '2026-10-12', daysAway: 15, nextStep: 'No school? Who’s with the kids', pokeOn: '2026-09-28', late: false },
    { key: 'c', title: 'Thanksgiving', date: '2026-11-26', daysAway: 60, nextStep: 'Hosting or going?', pokeOn: '2026-10-27', late: false },
  ]
  const out = comingUpForModel(items, [{ match: 'dentist', off: true }, { match: 'spirit day', step: 'Themed shirts', lead_days: 5 }], { today: '2026-09-27' })
  assert.deepEqual(out.items.map((i) => i.title), ['AC appointment', 'Columbus Day'])
  assert.equal(out.more, 1)
  assert.deepEqual(out.rules, ['never flag "dentist"', 'every "spirit day": Themed shirts, 5 days ahead'])
  assert.match(out.say, /Briefly/)
  assert.equal(comingUpForModel(items, [], { today: '2026-09-27', withinDays: 60 }).more, 0)
  const many = Array.from({ length: 8 }, (_, i) => ({ ...items[1], key: `k${i}` }))
  const five = comingUpForModel(many, [], { today: '2026-09-27' })
  assert.equal(five.items.length, 5)
  assert.equal(five.more, 3, 'counted for it, never by it')
})
