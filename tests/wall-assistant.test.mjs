import test from 'node:test'
import assert from 'node:assert/strict'
import { bandAnswer, latestExchange, pendingAction, answerEventId, bandState } from '../src/wall/assistant.ts'

const msg = (role, content, extra = {}) => ({ id: `${role}-${content.slice(0, 8)}`, role, content, ...extra })

test('answers are shown as plain spoken-style text: no markdown, and cut at a sentence when long', () => {
  assert.equal(bandAnswer('**Leave at 11:56.** You\'re driving Liv.\n\n- 29 min drive\n- Ferrin Park'), "Leave at 11:56. You're driving Liv. 29 min drive. Ferrin Park")
  const long = 'One sentence here. '.repeat(30).trim()
  const cut = bandAnswer(long)
  assert.ok(cut.length <= 300, `was ${cut.length}`)
  assert.ok(cut.endsWith('here.'))
})

test('the band shows the latest question and the answer that followed it', () => {
  const messages = [msg('user', 'first'), msg('assistant', 'one'), msg('user', 'What time do we leave?'), msg('assistant', 'Leave at 11:56.', { streaming: false })]
  assert.deepEqual(latestExchange(messages), { question: 'What time do we leave?', answer: messages[3] })
  assert.deepEqual(latestExchange([msg('user', 'hi')]), { question: 'hi', answer: null })
  assert.deepEqual(latestExchange([]), { question: null, answer: null })
})

test('an action waiting for a yes is found; done or cancelled ones are not', () => {
  const pending = msg('assistant', 'Add it?', { toolAction: { tool: 'create_event', args: {}, displayText: 'Dentist · Emme · Tue 3:30', status: 'pending' } })
  assert.equal(pendingAction([msg('user', 'add'), pending])?.id, pending.id)
  assert.equal(pendingAction([{ ...pending, toolAction: { ...pending.toolAction, status: 'done' } }]), null)
})

test('an answer about an event names it, so the wall can point at it', () => {
  assert.equal(answerEventId(msg('assistant', 'x', { conversationState: { activeEntityType: 'event', activeEventId: 'softball', expectedFollowUp: 'event_follow_up', establishedAt: '' } })), 'softball')
  assert.equal(answerEventId(msg('assistant', 'x', { toolAction: { tool: 'create_event', args: {}, displayText: '', status: 'done', resultEventId: 'new-1' } })), 'new-1')
  assert.equal(answerEventId(msg('assistant', 'x')), null)
})

test('the band says what it is doing', () => {
  assert.equal(bandState({ listening: true, loading: false, answer: null, pending: null }), 'LISTENING')
  assert.equal(bandState({ listening: false, loading: true, answer: null, pending: null }), 'THINKING')
  assert.equal(bandState({ listening: false, loading: false, answer: msg('assistant', 'x', { streaming: true }), pending: null }), 'THINKING')
  assert.equal(bandState({ listening: false, loading: false, answer: msg('assistant', 'x'), pending: null }), 'ANSWERED')
  assert.equal(bandState({ listening: false, loading: false, answer: msg('assistant', 'x'), pending: msg('assistant', 'y') }), 'NEEDS A YES')
  assert.equal(bandState({ listening: false, loading: false, answer: null, pending: null }), 'READY')
})

import { requestArgsFor, readActionResult } from '../src/wall/assistantActions.ts'

test('confirming an update sends the event\'s last-changed time, so a stale edit is refused', () => {
  const events = [{ id: 'softball', updated_at: '2026-09-25T19:44:58Z' }]
  assert.deepEqual(requestArgsFor('update_event', { id: 'softball', start: 'x' }, events), { id: 'softball', start: 'x', expected_updated_at: '2026-09-25T19:44:58Z' })
  assert.deepEqual(requestArgsFor('create_event', { title: 'Dentist' }, events), { title: 'Dentist' })
  assert.deepEqual(requestArgsFor('create_event', { title: 'Dentist', calendar_preflight: {} }, events), { title: 'Dentist', calendar_preflight: {}, allow_calendar_conflicts: true })
})

test('the action result: done with the new event, a clash that needs a second yes, or an error', () => {
  assert.deepEqual(readActionResult({ success: true, event_id: 'e1', action_id: 'a1' }, { title: 'x' }), { kind: 'done', eventId: 'e1', actionId: 'a1' })
  assert.deepEqual(
    readActionResult({ code: 'calendar_conflict_confirmation_required', calendar_preflight: { conflicts: [] } }, { title: 'x' }),
    { kind: 'conflict', args: { title: 'x', calendar_preflight: { conflicts: [] }, allow_calendar_conflicts: true } },
  )
  assert.deepEqual(readActionResult({ success: false, error: 'Nope' }, {}), { kind: 'error', message: 'Nope' })
  assert.deepEqual(readActionResult(null, {}), { kind: 'error', message: 'That didn’t work. Nothing was changed.' })
})
