import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// 2026-09-21 follow-ups from the event-create latency investigation.
//
// (1) The family-data index worker cron (jobid 55) was switched off in the
//     2026-08-25 pg_cron cleanup and never came back at a guardrail-compliant
//     interval, so family_data_index_queue stopped draining (~3,870 pending +
//     91 rows stranded in 'processing') and assistant retrieval went stale.
//     Embeddings only (gemini-embedding-001), bounded to 25 jobs per 15 min.
//
// (2) The analyze-conflicts and geocode row triggers were silent no-ops (the
//     vault has no SUPABASE_SERVICE_ROLE_KEY): they only logged a warning per
//     row. Conflict analysis really runs via orchestrate-household (HomePage +
//     generate-briefing); nothing depends on trigger-filled event coordinates
//     (travel ETA / weather / transportation planning resolve from the address).
//     The user does not want them turned on (cost) -- so remove the dead weight.

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
const exists = (rel) => existsSync(new URL(`../${rel}`, import.meta.url))

const WORKER = 'supabase/migrations/20260922225043_resume_family_data_index_worker.sql'
const DROPS = 'supabase/migrations/20260922225053_drop_dead_event_dispatch_triggers.sql'

test('index worker migration releases stranded jobs and reschedules the cron within the cron guardrails', () => {
  assert.ok(exists(WORKER), `${WORKER} must exist`)
  const sql = read(WORKER)
  // stranded 'processing' rows go back to the queue
  assert.match(sql, /update public\.family_data_index_queue[\s\S]*?status = 'pending'[\s\S]*?locked_at = null[\s\S]*?where status = 'processing'/i)
  // the old (disabled, 5-minute) job is replaced, not duplicated
  assert.match(sql, /cron\.unschedule/)
  assert.match(sql, /cron\.schedule\(\s*'process-family-data-index'/)
  // >= 15 minute interval, bounded batch, 10s http timeout (GUARDRAILS.md)
  assert.match(sql, /'\*\/15 \* \* \* \*'/)
  assert.match(sql, /timeout_milliseconds := 10000/)
  assert.match(sql, /"batch_size"\s*:\s*25/)
  // auth comes from the vault -- no embedded key
  assert.match(sql, /vault\.decrypted_secrets[\s\S]*?SUPABASE_ANON_KEY/)
  assert.doesNotMatch(sql, /eyJ[A-Za-z0-9_-]{20,}/)
})

test('dead analyze-conflicts / geocode row triggers and their functions are dropped', () => {
  assert.ok(exists(DROPS), `${DROPS} must exist`)
  const sql = read(DROPS)
  for (const trg of [
    'auto_analyze_conflicts_on_event_change',
    'auto_analyze_conflicts_on_event_member_change',
    'auto_geocode_on_event_location_change',
  ]) {
    assert.match(sql, new RegExp(`drop trigger if exists ${trg} on public\\.`, 'i'))
  }
  for (const fn of [
    'trigger_analyze_conflicts_for_event',
    'trigger_analyze_conflicts_for_event_member',
    'trigger_geocode_event_location',
  ]) {
    assert.match(sql, new RegExp(`drop function if exists public\\.${fn}\\(\\)`, 'i'))
  }
  // the cheap, live coordinate-reuse trigger must NOT be touched (check statements, not the explanatory comments)
  const statements = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n')
  assert.doesNotMatch(statements, /reset_coords_on_event_location_change|reset_event_coords_on_location_change/)
})

test('the orphaned geocode-event-location edge function is removed and nothing invokes it', () => {
  assert.equal(exists('supabase/functions/geocode-event-location/index.ts'), false)
  const scan = (dir) => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : scan(rel)
    return /\.(ts|tsx|mjs|js)$/.test(e.name) ? [rel] : []
  })
  const callers = [...scan('src'), ...scan('supabase/functions'), ...scan('scripts')]
    .filter((f) => read(f).includes('geocode-event-location'))
  assert.deepEqual(callers, [])
})

test('conflict analysis stays reachable through the live path (orchestrate-household), only the row triggers go', () => {
  assert.ok(exists('supabase/functions/analyze-conflicts/index.ts'))
  assert.match(read('supabase/functions/orchestrate-household/index.ts'), /invoke\('analyze-conflicts'/)
  assert.match(read('src/pages/HomePage.tsx'), /invoke\('orchestrate-household'/)
})

test('no migration after the drop re-creates the removed triggers', () => {
  const later = readdirSync(new URL('../supabase/migrations', import.meta.url))
    .filter((f) => f.endsWith('.sql') && f > '20260921184000')
  for (const f of later) {
    const sql = read(join('supabase/migrations', f))
    assert.doesNotMatch(sql, /create trigger (auto_analyze_conflicts_on_event|auto_geocode_on_event_location)/i)
  }
})
