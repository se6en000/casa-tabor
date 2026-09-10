import assert from 'node:assert/strict'
import test from 'node:test'

import { buildCopilotFlagRecord } from '../src/lib/copilotFlagPayload.ts'

const SAMPLE_MESSAGES = [
  { id: '1', role: 'user', content: 'find my old dentist apt' },
  { id: '2', role: 'assistant', content: 'Found: Dentist - Dr. Chen' },
]

test('buildCopilotFlagRecord snapshots the full transcript and uses the note as title/details', () => {
  const record = buildCopilotFlagRecord({
    messages: SAMPLE_MESSAGES,
    note: '  only gave subject line, no detail  ',
    page: 'calendar',
    sessionId: 'sess-1',
    deviceId: 'device-1',
    memberName: 'Jake',
  })

  assert.equal(record.severity, 'medium')
  assert.equal(record.status, 'open')
  assert.equal(record.source, 'user')
  assert.equal(record.title, 'only gave subject line, no detail')
  assert.equal(record.details, 'only gave subject line, no detail')
  assert.equal(record.page, 'calendar')
  assert.equal(record.session_id, 'sess-1')
  assert.equal(record.device_id, 'device-1')
  assert.equal(record.member_name, 'Jake')
  assert.deepEqual(record.transcript, SAMPLE_MESSAGES)
})

test('buildCopilotFlagRecord falls back to a generic title/null details when no note is given', () => {
  const record = buildCopilotFlagRecord({
    messages: SAMPLE_MESSAGES,
    note: '   ',
    page: 'home',
  })

  assert.equal(record.title, 'Flagged from copilot chat — home')
  assert.equal(record.details, null)
})

test('buildCopilotFlagRecord truncates an overly long note for the title', () => {
  const longNote = 'x'.repeat(200)
  const record = buildCopilotFlagRecord({
    messages: [],
    note: longNote,
    page: 'grocery',
  })

  assert.equal(record.title.length, 80)
  assert.equal(record.details, longNote)
})

test('buildCopilotFlagRecord defaults missing optional context to null', () => {
  const record = buildCopilotFlagRecord({
    messages: [],
    note: '',
    page: 'grocery',
  })

  assert.equal(record.session_id, null)
  assert.equal(record.device_id, null)
  assert.equal(record.member_name, null)
  assert.deepEqual(record.transcript, [])
})
