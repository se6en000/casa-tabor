import test from 'node:test'
import assert from 'node:assert/strict'
import { replayableResult } from '../supabase/functions/_shared/action-replay.mjs'

// Oct 6 (two bug reports): "Drop off Liv" clashed; the first yes was refused for the clash, and the six yeses after it
// (tapped, "add it", "add it anyway") were each handed that refusal again. A refused try is tried again.
test('a yes again for the same card: a saved answer comes back; a refused or failed one is tried again', () => {
  const refused = { status: 'failed', result_payload: { success: false, code: 'calendar_conflict_confirmation_required' } }
  assert.equal(replayableResult(refused), null)
  assert.deepEqual(replayableResult({ status: 'applied', result_payload: { success: true, event_id: 'e1' } }), { success: true, event_id: 'e1' })
  assert.equal(replayableResult(null), null)
  assert.equal(replayableResult({ status: 'applied', result_payload: null }), null)
})
