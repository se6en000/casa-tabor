import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Overnight queue (1), 2026-09-29: the events made during that evening's Google outage were queued for a
// retry but never synced by the worker — every run synced one event, then answered 500 "Google sync job
// not found", leaving the rest of its batch stuck "running" until their leases ran out (four rounds, then
// "failed"). The sync clears an event's queued jobs when it succeeds — the one the worker holds too — so
// finishing it found nothing, and the throw abandoned the batch.
const worker = readFileSync(new URL('../supabase/functions/process-google-sync-jobs/index.ts', import.meta.url), 'utf8')

test('a job the sync already cleared counts as done, not an error', () => {
  assert.match(worker, /const cleared = \(message: string \| undefined\) => \/not found\/i\.test\(message \?\? ''\)/)
  assert.match(worker, /if \(finishError && !cleared\(finishError\.message\)\)/)
})

test('one job’s trouble never strands the rest of the batch', () => {
  const loop = worker.slice(worker.indexOf('for (const job of jobs ?? [])'))
  assert.match(loop, /try \{/)
  assert.doesNotMatch(loop.slice(0, loop.indexOf('return new Response')), /throw new Error\(finishError\.message\)/)
})
