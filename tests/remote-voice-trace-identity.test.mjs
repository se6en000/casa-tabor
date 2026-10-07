import test from 'node:test'
import assert from 'node:assert/strict'

// Oct 7 (Jake: "there still is a 'listening pause' between her last question and capturing my response"): the follow-up
// sentences of a conversation never reached the voice log — each looked like a repeat of the first (same session, same
// event; only the payload's utterance_id differed) and was dropped, so the pause couldn't be traced.
test('two traces that differ only in their payload are two traces; the same one twice is one', async () => {
  const { traceIdentity } = await import('../src/lib/voiceTraceIdentity.ts')
  const base = { channel: 'audit', sessionId: 's', turnId: '', seq: undefined, event: 'asr_speech_started', detail: '' }
  const first = traceIdentity({ ...base, payload: { utterance_id: 'u1' } })
  const second = traceIdentity({ ...base, payload: { utterance_id: 'u2' } })
  assert.notEqual(first, second)
  assert.equal(first, traceIdentity({ ...base, payload: { utterance_id: 'u1' } }))
})
