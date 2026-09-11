import assert from 'node:assert/strict'
import test from 'node:test'

import { IDLE_TIMEOUT_MS, isSessionStale } from '../src/hooks/useAISession.ts'

// Bug found while discussing when the copilot chat should reset: the existing
// mechanism (this same IDLE_TIMEOUT_MS constant) checked time since the
// session was *created*, not time since it was last actually used -- despite
// being named an "idle" timeout. A session created at 9am and genuinely idle
// the whole day would still read as "not stale" right up to the 12-hour mark,
// while a session created at 9am, used continuously, would also never look
// stale from creation time alone -- created_at alone can't tell those apart.

test('a session with no recent activity beyond the idle window is stale', () => {
  const now = Date.parse('2026-09-11T12:00:00.000Z')
  const session = {
    created_at: '2026-09-11T09:00:00.000Z',
    last_activity_at: '2026-09-11T11:00:00.000Z', // 1 hour before "now"
  }
  assert.equal(isSessionStale(session, now, 10 * 60 * 1000), true) // 10 min window
})

test('a session with activity inside the idle window is not stale', () => {
  const now = Date.parse('2026-09-11T12:00:00.000Z')
  const session = {
    created_at: '2026-09-11T09:00:00.000Z',
    last_activity_at: '2026-09-11T11:55:00.000Z', // 5 minutes before "now"
  }
  assert.equal(isSessionStale(session, now, 10 * 60 * 1000), false)
})

test('falls back to created_at when last_activity_at is absent (a session that never got a message saved)', () => {
  const now = Date.parse('2026-09-11T12:00:00.000Z')
  const staleByCreation = {
    created_at: '2026-09-11T09:00:00.000Z', // 3 hours ago
  }
  assert.equal(isSessionStale(staleByCreation, now, 10 * 60 * 1000), true)

  const freshByCreation = {
    created_at: '2026-09-11T11:58:00.000Z', // 2 minutes ago
  }
  assert.equal(isSessionStale(freshByCreation, now, 10 * 60 * 1000), false)
})

test('an explicitly ended session is always stale, regardless of timing', () => {
  const now = Date.parse('2026-09-11T12:00:00.000Z')
  const session = {
    created_at: '2026-09-11T09:00:00.000Z',
    last_activity_at: '2026-09-11T11:59:59.000Z', // 1 second before "now"
    ended_at: '2026-09-11T11:59:59.000Z',
  }
  assert.equal(isSessionStale(session, now, 10 * 60 * 1000), true)
})

test('the exported default idle timeout reflects a genuine short-lived, per-visit session, not a full day', () => {
  // This app is a shared, wall-mounted household kiosk, not a single-user
  // sustained-task tool -- see the Alexa-vs-ChatGPT discussion this was built
  // from. A multi-hour default would let an unrelated task from hours earlier
  // silently bleed into a later, unrelated request.
  assert.ok(IDLE_TIMEOUT_MS <= 30 * 60 * 1000, `expected a short idle window, got ${IDLE_TIMEOUT_MS}ms`)
  assert.ok(IDLE_TIMEOUT_MS >= 2 * 60 * 1000, `expected enough slack for a brief real interruption, got ${IDLE_TIMEOUT_MS}ms`)
})
