import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/components/calendar/EventDetailPanel.tsx', import.meta.url), 'utf8')

test('EventDetailPanel listens for immediate event update broadcasts', () => {
  assert.match(source, /const \[displayEvent, setDisplayEvent\] = useState<EventWithDetails \| null>\(eventSummary\)/)
  assert.match(source, /window\.addEventListener\('casa:event-updated', handleEventUpdated\)/)
  assert.match(source, /setDisplayEvent\(current => current \? \{ \.\.\.current, \.\.\.detail\.patch \} : current\)/)
  assert.match(source, /fetchedUpdatedAt >= currentUpdatedAt/)
})
