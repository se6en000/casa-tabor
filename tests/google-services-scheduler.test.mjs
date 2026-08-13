import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL('../supabase/migrations/20260813134500_repair_google_service_schedules.sql', import.meta.url),
  'utf8',
)
const scanner = readFileSync(new URL('../supabase/functions/scan-gmail-inbox/index.ts', import.meta.url), 'utf8')
const deploy = readFileSync(new URL('../pi/deploy-prod-and-refresh-pi.sh', import.meta.url), 'utf8')

test('repairs both Google service schedules at 15-minute cadence with vault auth', () => {
  assert.match(migration, /'sync-google-calendars',\s*'\*\/15 \* \* \* \*'/)
  assert.match(migration, /'scan-gmail-inbox',\s*'\*\/15 \* \* \* \*'/)
  assert.match(migration, /vault\.decrypted_secrets/)
  assert.match(migration, /cron\.unschedule/)
})

test('records Gmail attempts, successes, and account errors', () => {
  assert.match(scanner, /gmail_last_scan_attempt_at/)
  assert.match(scanner, /gmail_last_scan_success_at/)
  assert.match(scanner, /gmail_last_scan_error/)
})

test('deploy script targets only the canonical Vercel project', () => {
  assert.match(deploy, /HEAD:main/)
  assert.match(deploy, /--project casa-tabor/)
  assert.match(deploy, /PROJECT_NAME.*casa-tabor/s)
})
