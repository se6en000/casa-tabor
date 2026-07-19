import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url),
  'utf8',
)

test('create_event deterministically infers missing location from title and triggers transportation planning', () => {
  assert.match(source, /function resolveCreateTitleAndLocation/)
  assert.match(source, /title:\s*normalizedTitle/)
  assert.match(source, /location_name:\s*normalizedLocation \?\? null/)
  assert.match(source, /ensure-event-transportation-plan/)
  assert.match(source, /if \(normalizedEventType !== 'reminder'\)/)
})
