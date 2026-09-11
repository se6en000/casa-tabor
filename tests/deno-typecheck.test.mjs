import assert from 'node:assert/strict'
import test from 'node:test'

import { BLOCKING_CODES, classifyCheckOutput } from '../scripts/deno-typecheck.mjs'

test('a clean deno check output with no TS codes and no failure is not a resolution failure', () => {
  // classifyCheckOutput is only ever called on output from a *failed* deno
  // check invocation (the main loop `continue`s past successful ones before
  // reaching this), so an empty/whitespace-only string here represents "the
  // command failed, but printed nothing recognizable" -- still a real problem.
  const result = classifyCheckOutput('')
  assert.equal(result.resolutionFailure, true)
})

test('a module resolution failure (no TS code at all) is flagged as a resolution failure, not silently 0 errors', () => {
  // Bug: a file that fails to resolve entirely (e.g. an unresolvable npm
  // import) produces output with no TS#### code, so the old logic counted
  // zero blocking and zero advisory errors for it -- indistinguishable from a
  // fully clean file. Found via send-push-notification/index.ts hitting
  // "Could not find a matching package for 'npm:web-push'" during a real scan.
  const output = `error: Could not find a matching package for 'npm:web-push' in the node_modules directory. Ensure you have all your JSR and npm dependencies listed in your deno.json or package.json, then run \`deno install\`.\n    at file:///home/jake/casa-tabor/supabase/functions/send-push-notification/index.ts:5:21`
  const result = classifyCheckOutput(output)
  assert.equal(result.resolutionFailure, true)
  assert.deepEqual(result.blocking, [])
  assert.deepEqual(result.advisory, [])
})

test('a normal type-check failure with only advisory codes is not a resolution failure', () => {
  const output = `TS2339 [ERROR]: Property 'id' does not exist on type 'never'.\n  const x = row.id\n            ~~~~~\n    at file:///some/file.ts:10:13\n\nFound 1 error.`
  const result = classifyCheckOutput(output)
  assert.equal(result.resolutionFailure, false)
  assert.deepEqual(result.blocking, [])
  assert.deepEqual(result.advisory, ['TS2339'])
})

test('an undefined-name error is classified as blocking', () => {
  const output = `TS2304 [ERROR]: Cannot find name 'payload'.\n  const { event_id } = payload\n                       ~~~~~~~\n    at file:///some/file.ts:5:24`
  const result = classifyCheckOutput(output)
  assert.equal(result.resolutionFailure, false)
  assert.deepEqual(result.blocking, ['TS2304'])
  assert.deepEqual(result.advisory, [])
})

test('a mix of blocking and advisory codes in one file is split correctly', () => {
  const output = [
    `TS2304 [ERROR]: Cannot find name 'foo'.`,
    `TS2339 [ERROR]: Property 'bar' does not exist on type 'never'.`,
    `TS2552 [ERROR]: Cannot find name 'baz'. Did you mean 'bar'?`,
  ].join('\n')
  const result = classifyCheckOutput(output)
  assert.equal(result.resolutionFailure, false)
  assert.deepEqual(result.blocking, ['TS2304', 'TS2552'])
  assert.deepEqual(result.advisory, ['TS2339'])
})

test('BLOCKING_CODES is exactly the undefined-name error class', () => {
  assert.deepEqual([...BLOCKING_CODES].sort(), ['TS2304', 'TS2552'])
})
