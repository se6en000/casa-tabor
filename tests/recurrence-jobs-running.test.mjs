import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Jake, 2026-09-27: "I want to be able to go into Google and click on any kind of birthday or
// yearly event and be able to change it … and it will sync perfectly with Casa". Casa has a
// two-way repeating-event system, but its jobs had been switched off outside the code (seen off
// 2026-09-27): Google's repeating events never became Casa series, and Casa's edits to a series
// never reached Google. This turns the importer and the outbox back on, by the cron rules.
const sql = readFileSync(new URL('../supabase/migrations/20260927160000_recurrence_jobs_back_on.sql', import.meta.url), 'utf8')

function job(name) {
  const at = sql.indexOf(`'${name}'`, sql.indexOf('cron.schedule('))
  assert.ok(at > 0, `${name} is scheduled`)
  return sql.slice(at, sql.indexOf('$$\n);', at))
}

test('the importer (Google → Casa series) and the outbox (Casa series → Google) run every 15 minutes', () => {
  for (const [name, fn, schedule] of [
    ['import-google-recurrence-v2', 'import-google-recurrence', "'5,20,35,50 * * * *'"],
    ['google-recurrence-outbox', 'process-google-recurrence-outbox', "'3,18,33,48 * * * *'"],
  ]) {
    const body = job(name)
    assert.ok(body.includes(schedule), `${name} at ${schedule}`)
    assert.match(body, new RegExp(`/functions/v1/${fn}'`))
    assert.match(body, /timeout_milliseconds := 10000/)
    assert.match(body, /vault\.decrypted_secrets/)
  }
})

test('the materializer stays off for now: switched on, it would add duplicate school runs', () => {
  assert.doesNotMatch(sql, /cron\.schedule\(\s*'materialize-recurring-events'/)
})
