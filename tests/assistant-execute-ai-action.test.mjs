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
  // enrich-event now runs (fire-and-forget) so contact resolution and logistics
  // happen for AI-chat-created events (see tests/dedupe-server-find-similar-wiring.test.mjs),
  // but it MUST be invoked in targeted mode (target_fields set) — enrich-event's
  // untargeted/full mode overwrites events.location_name/address with its own
  // LLM guess, which would reintroduce exactly the reinterpretation bug this
  // test guards against. Targeted mode skips that overwrite entirely while
  // still filling contact_name/logistics/category normally.
  const enrichInvokeIndex = createEventSource.indexOf("functions.invoke('enrich-event'")
  assert.ok(enrichInvokeIndex > -1, 'create_event should fire enrich-event so AI-created events get contact/logistics resolution')
  assert.match(createEventSource.slice(enrichInvokeIndex, enrichInvokeIndex + 200), /target_fields:\s*ENRICHMENT_FIELDS/)
  assert.doesNotMatch(createEventSource, /functions\.invoke\('ensure-event-transportation-plan'/)
})
