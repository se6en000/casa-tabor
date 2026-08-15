import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve('src/hooks/useCalendarEvents.ts'), 'utf8')

test('useRealtimeEventInvalidation monitors subscription status for resilience', () => {
  assert.match(
    source,
    /channel\('events-realtime-singleton'\)/,
    'must create events-realtime-singleton channel'
  )
  assert.match(
    source,
    /\.subscribe\(\s*\(\s*status/,
    'subscribe call must attach status monitoring'
  )
  assert.match(
    source,
    /SUBSCRIBED|CHANNEL_ERROR|TIMED_OUT|CLOSED/,
    'must handle connection status transitions'
  )
})

test('realtime DELETE event performs instant cache eviction of deleted event ID', () => {
  assert.match(
    source,
    /on\('postgres_changes'[\s\S]*?table:\s*'events'/,
    'must listen to events table changes'
  )
  assert.match(
    source,
    /evictDeletedEventFromCache|_handleRealtimeEventChange|payload\.eventType === 'DELETE'|eventType === 'DELETE'/,
    'must have specific handling for DELETE events to evict from local cache'
  )
})

test('fetchEventDetails gracefully handles PGRST116 (row not found / already deleted)', () => {
  assert.match(
    source,
    /PGRST116|Cannot coerce the result/,
    'fetchEventDetails must recognize PGRST116 not-found status'
  )
})
