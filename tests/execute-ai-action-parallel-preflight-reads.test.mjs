import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-22: measured live -- creating "Kelly Workout" via chat, the event
// row itself was written in ~1.1s (the new upsert_event_bundle RPC works),
// but the confirm-click-to-response round trip took ~14.7s total. The gap was
// BEFORE the insert: getExistingActionResult (idempotency check), the
// nearbyEvents duplicate/conflict query, and the find_similar_places location
// match all ran SEQUENTIALLY even though the latter two don't depend on each
// other's results -- each paying its own network/connection cost one after
// another instead of overlapping.
//
// getExistingActionResult is deliberately left sequential/first: it's an
// idempotency short-circuit that must return the ORIGINAL cached result for a
// replayed action_id even if something else would now fail validation, so
// reordering it relative to the validation/duplicate-check logic would be a
// real behavior change, not just a performance one. nearbyEvents and
// find_similar_places have no such ordering dependency on each other.
const source = readFileSync(new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url), 'utf8')

function createEventBlock() {
  const start = source.indexOf("if (tool === 'create_event')")
  const end = source.indexOf("if (tool === 'create_recipe')")
  assert.ok(start >= 0 && end > start)
  return source.slice(start, end)
}

test('find_similar_places is kicked off before nearbyEvents is awaited, not after, so they overlap', () => {
  const block = createEventBlock()
  const kickoffIdx = block.indexOf("sb.rpc('find_similar_places'")
  const nearbyAwaitIdx = block.indexOf("await sb\n        .from('events')")
  assert.ok(kickoffIdx >= 0, 'find_similar_places call not found')
  assert.ok(nearbyAwaitIdx >= 0, 'nearbyEvents query not found')
  assert.ok(kickoffIdx < nearbyAwaitIdx, 'find_similar_places must be started before nearbyEvents is awaited')
})

test('find_similar_places is only awaited once (the in-flight promise, not called a second time)', () => {
  const block = createEventBlock()
  const calls = block.match(/sb\.rpc\('find_similar_places'/g) ?? []
  assert.equal(calls.length, 1, 'find_similar_places should be invoked exactly once per create_event call')
})

test('getExistingActionResult (idempotency check) keeps its original position -- not parallelized with the reads that follow validation', () => {
  const block = createEventBlock()
  const idempotencyIdx = block.indexOf('getExistingActionResult(sb, createActionId)')
  const kickoffIdx = block.indexOf("sb.rpc('find_similar_places'")
  assert.ok(idempotencyIdx >= 0 && kickoffIdx >= 0)
  assert.ok(idempotencyIdx < kickoffIdx, 'idempotency check must still run, and be awaited, before the parallelized reads')
})
