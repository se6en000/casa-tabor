import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyPendingConfirmation } from '../src/lib/assistantConfirmation.mjs'
import { assistantErrorMessage } from '../src/lib/assistantErrors.mjs'

test('pending confirmations accept concise typed and spoken approvals', () => {
  for (const phrase of ['yes', 'Okay.', 'go ahead', 'do it', 'proceed']) {
    assert.equal(classifyPendingConfirmation(phrase), 'confirm', phrase)
  }
})

test('pending confirmations accept concise cancellations', () => {
  for (const phrase of ['no', 'cancel', "don't", 'never mind']) {
    assert.equal(classifyPendingConfirmation(phrase), 'cancel', phrase)
  }
})

test('confirmation routing does not consume corrections or new requests', () => {
  for (const phrase of ['yes, but change the date', 'no dairy', 'okay add another event']) {
    assert.equal(classifyPendingConfirmation(phrase), null, phrase)
  }
})

test('assistant errors never expose provider timeout codes', () => {
  assert.equal(
    assistantErrorMessage('llm_error', 'model_timeout_6000ms'),
    'Casa AI took too long to respond. Please try again.',
  )
  assert.doesNotMatch(assistantErrorMessage('llm_error', 'provider_socket_123'), /provider|socket|123/i)
})
