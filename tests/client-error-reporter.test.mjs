import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-23: client-side error/crash monitoring (item 4 of the app
// best-practices review). No Sentry account exists, so this is a self-hosted
// pipeline matching the security posture already established for
// ai_drawer_debug_events: the client has no direct table access, all writes
// go through a dedicated Edge Function (log-client-error) using the service
// role. A render loop must never turn error REPORTING into its own incident.

const migration = readFileSync(
  new URL('../supabase/migrations/20260923190000_client_error_log.sql', import.meta.url),
  'utf8',
)
test('client_error_log grants nothing to anon/authenticated -- writes only via the service-role Edge Function', () => {
  assert.match(migration, /revoke all on public\.client_error_log from anon, authenticated/)
  assert.match(migration, /grant all on public\.client_error_log to service_role/)
  assert.match(migration, /enable row level security/)
})

const fn = readFileSync(new URL('../supabase/functions/log-client-error/index.ts', import.meta.url), 'utf8')
test('the edge function uses the service role to write, never trusts a client-supplied device/user identity beyond a capped string', () => {
  assert.match(fn, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(fn, /\.slice\(0, MAX_MESSAGE_LEN\)/)
  assert.match(fn, /\.slice\(0, MAX_STACK_LEN\)/)
})
test('a missing/empty message is rejected rather than logging a useless empty row', () => {
  assert.match(fn, /if \(!message\)/)
})
test('a failure inside the logger itself never surfaces as an error to the reporting client', () => {
  const idx = fn.indexOf('catch (err)')
  const block = fn.slice(idx, idx + 300)
  assert.match(block, /status: 200/)
})

test('reportClientError caps total reports per session and dedupes identical messages (a render loop cannot spam the log)', () => {
  const src = readFileSync(new URL('../src/lib/clientErrorReporter.ts', import.meta.url), 'utf8')
  assert.match(src, /MAX_REPORTS_PER_SESSION/)
  assert.match(src, /seenMessages\.has\(dedupeKey\)/)
  assert.match(src, /reportCount >= MAX_REPORTS_PER_SESSION/)
})

test('reportClientError never throws even if fetch/window/error access itself fails', () => {
  const src = readFileSync(new URL('../src/lib/clientErrorReporter.ts', import.meta.url), 'utf8')
  const idx = src.indexOf('export function reportClientError')
  const block = src.slice(idx, src.indexOf('\n}', idx) + 2)
  assert.match(block, /try \{/)
  assert.match(block, /catch \{/)
  assert.match(block, /\.catch\(\(\) => \{\}\)/) // the fetch itself is also swallowed
})

test('main.tsx wires global window.onerror/unhandledrejection capture on boot', () => {
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
  assert.match(main, /initGlobalErrorReporting\(\)/)
  const reporter = readFileSync(new URL('../src/lib/clientErrorReporter.ts', import.meta.url), 'utf8')
  assert.match(reporter, /addEventListener\('error'/)
  assert.match(reporter, /addEventListener\('unhandledrejection'/)
})

test('the top-level React error boundary reports crashes too, not just window-level errors', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const idx = app.indexOf('componentDidCatch')
  assert.ok(idx >= 0)
  const block = app.slice(idx, idx + 150)
  assert.match(block, /reportClientError\(error, 'react-error-boundary'\)/)
})
