import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url),
  'utf8',
)
const createEventSource = source.slice(
  source.indexOf("if (tool === 'create_event')"),
  source.indexOf("if (tool === 'create_recipe')"),
)

test('create_event preserves semantic title and location without executor reinterpretation', () => {
  assert.doesNotMatch(source, /function resolveCreateTitleAndLocation/)
  assert.match(createEventSource, /title:\s*normalizedTitle/)
  // Location resolves through the directory fuzzy-match first (falls back to
  // the raw normalizedLocation text when no saved_places match is found).
  assert.match(createEventSource, /location_name:\s*resolvedLocationName \?\? null/)
  assert.doesNotMatch(createEventSource, /functions\.invoke\('enrich-event'/)
  assert.doesNotMatch(createEventSource, /functions\.invoke\('ensure-event-transportation-plan'/)
})
