import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSortPrompt, parseSortResult, NEEDS } from '../supabase/functions/_shared/todo-sort.mjs'

// P3.22 step 2: Casa sorts Jake's Reminders to-dos into shapes, with a size, a cost, a next step
// and what it needs. It suggests merges, closing stale ones and moving groceries — only
// suggestions: those change his iOS list, so each waits for his yes.
const items = [
  { id: 'a', title: 'Troubleshoot the water heater with the e zero five error code', due: '2026-09-21' },
  { id: 'b', title: 'Troubleshoot the water heater with the e zero five error code', due: null },
  { id: 'c', title: 'Pick Up Owen\'s Birthday Cupcakes', due: '2026-07-08' },
  { id: 'd', title: 'Paper towels', due: null },
]

test('the prompt carries each item with its id and date, today, and the answer format', () => {
  const prompt = buildSortPrompt(items, { today: '2026-09-28' })
  for (const i of items) assert.ok(prompt.includes(`[${i.id}]`) && prompt.includes(i.title))
  assert.match(prompt, /2026-09-28/)
  assert.match(prompt, /nudge.*quick.*fix.*project.*dated/s)
  for (const n of NEEDS) assert.ok(prompt.includes(n), n)
})

test('a good answer is kept; anything outside the rules is dropped or cleaned', () => {
  const answer = JSON.stringify([
    { id: 'a', shape: 'fix', minutes: 20, cost: 0, next_step: 'Check the gas valve, then reset it', needs: ['Hot water', 'Made-up'] },
    { id: 'b', shape: 'fix', minutes: 20, suggestion: { kind: 'merge', with: 'a', reason: 'Same as the other water heater item' } },
    { id: 'c', shape: 'dated', suggestion: { kind: 'done', reason: 'Owen\'s birthday was in July' } },
    { id: 'd', shape: 'quick', suggestion: { kind: 'shopping', reason: 'A grocery' } },
    { id: 'zzz', shape: 'fix' },
    { id: 'a', shape: 'weird' },
  ])
  const out = parseSortResult('```json\n' + answer + '\n```', items, { today: '2026-09-28' })
  assert.deepEqual(Object.keys(out).sort(), ['a', 'b', 'c', 'd'])
  assert.deepEqual(out.a, { shape: 'fix', minutes: 20, cost_cents: 0, next_step: 'Check the gas valve, then reset it', needs: ['Hot water'], suggestion: null })
  assert.deepEqual(out.b.suggestion, { kind: 'merge', with: 'a', reason: 'Same as the other water heater item' })
  assert.equal(out.c.suggestion.kind, 'done')
  assert.equal(out.d.suggestion.kind, 'shopping')
})

test('a merge must point at another real item; sizes stay sensible', () => {
  const out = parseSortResult(JSON.stringify([
    { id: 'a', shape: 'quick', minutes: 99999, cost: -5, suggestion: { kind: 'merge', with: 'nope' } },
    { id: 'b', shape: 'quick', suggestion: { kind: 'merge', with: 'b' } },
  ]), [{ id: 'a', due: null }, { id: 'b', due: null }], { today: '2026-09-28' })
  assert.equal(out.a.minutes, null)
  assert.equal(out.a.cost_cents, null)
  assert.equal(out.a.suggestion, null)
  assert.equal(out.b.suggestion, null)
})

test('not JSON at all: nothing', () => {
  assert.deepEqual(parseSortResult('sorry, I cannot', [{ id: 'a', due: null }], { today: '2026-09-28' }), {})
})

// First live run (2026-09-28): it suggested closing "Replace tire sensor" because its date had
// passed, and closing a tryout item due Oct 19 "in the past". A missed date is still a to-do, and
// a model's date slip must never close anything.
test('"done" only for an item whose date is really in the past; never for an undated one', () => {
  const dated = [{ id: 'future', title: 'Tryout info', due: '2026-10-19' }, { id: 'past', title: 'Cupcakes', due: '2026-07-08' }, { id: 'none', title: 'Tire sensor', due: null }]
  const out = parseSortResult(JSON.stringify([
    { id: 'future', shape: 'dated', suggestion: { kind: 'done', reason: 'past' } },
    { id: 'past', shape: 'dated', suggestion: { kind: 'done', reason: 'birthday was in July' } },
    { id: 'none', shape: 'quick', suggestion: { kind: 'done', reason: 'probably done' } },
  ]), dated, { today: '2026-09-28' })
  assert.equal(out.future.suggestion, null)
  assert.equal(out.past.suggestion.kind, 'done')
  assert.equal(out.none.suggestion, null)
})

test('the prompt says a missed date is still a to-do, repeats merge first, and what "dated" and "Safety" mean', () => {
  const prompt = buildSortPrompt(items, { today: '2026-09-28' })
  assert.match(prompt, /missed .*still a to-do/i)
  assert.match(prompt, /repeat/i)
  assert.match(prompt, /"dated".*event|deadline/is)
  assert.match(prompt, /Safety.*hazard/is)
})

test('"done" is only ever for a dated moment, never a job whose date went by', () => {
  const its = [{ id: 'job', due: '2026-09-16' }, { id: 'moment', due: '2026-09-25' }]
  const out = parseSortResult(JSON.stringify([
    { id: 'job', shape: 'quick', suggestion: { kind: 'done', reason: 'date passed' } },
    { id: 'moment', shape: 'dated', suggestion: { kind: 'done', reason: 'spirit day was last week' } },
  ]), its, { today: '2026-09-28' })
  assert.equal(out.job.suggestion, null)
  assert.equal(out.moment.suggestion.kind, 'done')
})
