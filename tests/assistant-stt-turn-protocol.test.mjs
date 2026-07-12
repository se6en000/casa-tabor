import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeBridgeTurnMessage,
  reconcileTranscriptRevision,
  STT_TURN_PROTOCOL,
} from '../src/lib/sttTurnProtocol.mjs'

test('candidate protocol rejects unknown bridge messages', () => {
  assert.equal(STT_TURN_PROTOCOL, 'candidate-v1')
  assert.equal(normalizeBridgeTurnMessage(null), null)
  assert.equal(normalizeBridgeTurnMessage({ type: 'unexpected' }), null)
  assert.equal(normalizeBridgeTurnMessage({ type: 'turn_candidate', text: 'hello' })?.text, 'hello')
})

test('transcript revisions preserve a committed prefix and revisable suffix', () => {
  assert.equal(reconcileTranscriptRevision({ committed: 'do we', interim: 'have milk' }), 'do we have milk')
  assert.equal(reconcileTranscriptRevision({ committed: 'do we', interim: 'do we have milk' }), 'do we have milk')
  assert.equal(reconcileTranscriptRevision({ committed: 'do we have milk', interim: '' }), 'do we have milk')
})
