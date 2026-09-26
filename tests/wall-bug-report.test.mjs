import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBugReport } from '../src/wall/bugReport.ts'

const messages = [
  { id: 'u1', role: 'user', content: 'Where is Kelly doing yoga at 8AM?' },
  { id: 'a1', role: 'assistant', content: 'KT Yoga at 8 AM UTC, which is 4 AM local.', imageDataUrl: 'data:image/png;base64,AAAA' },
  { id: 'u2', role: 'user', content: 'Add dinner at 7' },
  { id: 'a2', role: 'assistant', content: 'Add “Dinner” Sat 7 PM?', toolAction: { tool: 'create_event', args: { title: 'Dinner' }, displayText: 'Dinner · Sat 7 PM', status: 'cancelled' } },
]
const base = {
  messages,
  seenAt: { u1: '2026-09-26T00:48:01.000Z', a1: '2026-09-26T00:48:05.000Z' },
  sessionId: 'sess-1',
  heard: 'where is kelly doing yoga at 8 a.m.',
  categories: ['Wrong time or day'],
  expected: 'Saturday 8 AM, local time',
  happened: 'It said UTC and 4 AM',
  context: { surface: 'wall', build: 'abc123', viewer: 'Jake', at: '2026-09-26T00:49:00.000Z', timeZone: 'America/New_York', utcOffset: '-04:00', screen: '1920x1080', pointAt: 'kt-yoga', dayOnShow: '2026-09-26' },
}

test('the report is one debug entry: a short summary, the session to trace it by, and the whole story in the payload', () => {
  const r = buildBugReport(base)
  assert.equal(r.event, 'user_bug_report')
  assert.equal(r.sessionId, 'sess-1')
  assert.equal(r.page, 'wall')
  assert.equal(r.detail, 'Wrong time or day — expected: Saturday 8 AM, local time — happened: It said UTC and 4 AM')
  assert.deepEqual(r.payload.feedback, { categories: ['Wrong time or day'], expected: 'Saturday 8 AM, local time', happened: 'It said UTC and 4 AM' })
  assert.equal(r.payload.heard, 'where is kelly doing yoga at 8 a.m.')
  assert.equal(r.payload.context.build, 'abc123')
})

test('every turn is kept, in order, with when it appeared, and what any proposed action was and became', () => {
  const r = buildBugReport(base)
  assert.deepEqual(r.payload.conversation.map((m) => [m.role, m.at]), [['user', '2026-09-26T00:48:01.000Z'], ['assistant', '2026-09-26T00:48:05.000Z'], ['user', null], ['assistant', null]])
  assert.deepEqual(r.payload.conversation[3].action, { tool: 'create_event', args: { title: 'Dinner' }, shown: 'Dinner · Sat 7 PM', status: 'cancelled' })
})

test('pictures are noted, not copied (a photo would swamp the report)', () => {
  const r = buildBugReport(base)
  assert.equal(r.payload.conversation[1].images, 1)
  assert.equal(JSON.stringify(r).includes('base64'), false)
})

test('a report with no words from the person still says what kind of problem it was', () => {
  const r = buildBugReport({ ...base, expected: '', happened: '', categories: ["Didn't hear me"] })
  assert.equal(r.detail, "Didn't hear me")
})

test('a report sent after the band closed carries the conversation before it (Jake: "this was the previous conversation")', async () => {
  const { conversationForReport } = await import('../src/wall/bugReport.ts')
  const previous = { messages: [{ id: 'u1', role: 'user', content: 'Move the yoga appointment up to 8 30 a.m.' }], seenAt: { u1: '2026-09-26T12:03:57Z' }, sessionId: 's-old' }
  const empty = { messages: [], seenAt: {}, sessionId: 's-new' }
  assert.deepEqual(conversationForReport(empty, previous), { ...previous, previous: true })
  const current = { messages: [{ id: 'u2', role: 'user', content: 'what is on saturday' }], seenAt: {}, sessionId: 's-now' }
  assert.deepEqual(conversationForReport(current, previous), { ...current, previous: false })
  assert.deepEqual(conversationForReport(empty, null), { ...empty, previous: false })
})
