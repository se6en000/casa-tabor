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

// 2026-09-19: create_event used to `await` the Google Calendar sync call for
// every real (non-reminder) event -- a full external Google API round trip
// blocking the response every single time. Confirmed live via ai_bug_reports
// a6f58eba's sibling incidents that create_event/action_execute_completed
// routinely took 10+ seconds. dispatchInBackground uses EdgeRuntime.waitUntil
// (the same mechanism already used in ai-assistant/index.ts and
// scan-gmail-inbox/index.ts) so the promise survives past the response
// instead of either blocking the user or risking being killed mid-flight as
// a bare floating promise would in Deno Deploy.
test('dispatchInBackground exists and falls back to awaiting when EdgeRuntime.waitUntil is unavailable', () => {
  assert.match(source, /async function dispatchInBackground/)
  const idx = source.indexOf('async function dispatchInBackground')
  const block = source.slice(idx, idx + 600)
  assert.match(block, /EdgeRuntime\?\.waitUntil/)
  assert.match(block, /else\s*\{\s*await promise/)
})

test('create_event dispatches Google Calendar sync in the background instead of blocking the response', () => {
  assert.match(createEventSource, /await dispatchInBackground\(\s*sb\.functions\.invoke\('create-google-event'/)
  assert.doesNotMatch(
    createEventSource,
    /await sb\.functions\.invoke\('create-google-event'/,
    'create-google-event must not be awaited directly anymore -- it should go through dispatchInBackground',
  )
})

test('create_event dispatches reminder enrichment in the background via dispatchInBackground, not a bare floating promise', () => {
  assert.match(createEventSource, /await dispatchInBackground\(\s*sb\.functions\.invoke\('enrich-event'/)
})

test('auditEventCreate stays fully synchronous -- it is also the idempotency ledger read by getExistingActionResult', () => {
  const idx = createEventSource.lastIndexOf('await auditEventCreate(')
  assert.ok(idx > -1, 'auditEventCreate must still be called')
  assert.doesNotMatch(
    createEventSource,
    /dispatchInBackground\(\s*auditEventCreate/,
    'auditEventCreate must never be deferred -- getExistingActionResult reads the same table for retry idempotency, and deferring it would allow duplicate event creation on a client retry',
  )
})
