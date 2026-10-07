import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The digest's service and schedules (FAMILY_WALL_PLAN.md P3.19 step 3).
const fn = readFileSync(new URL('../supabase/functions/coming-up/index.ts', import.meta.url), 'utf8')
const sql = readFileSync(new URL('../supabase/migrations/20260927230000_coming_up.sql', import.meta.url), 'utf8')

test('list, done / not needed / snooze a week, the Sunday digest and the daily pokes', () => {
  for (const a of ["'list'", "'done'", "'dismiss'", "'snooze'", "'send_digest'", "'send_pokes'"]) assert.ok(fn.includes(a), a)
  assert.match(fn, /snoozed_until: plusDays\(today, 7\)/)
  assert.match(fn, /import \{ buildComingUp,[^}]*SEASONS \} from '\.\.\/_shared\/coming-up\.mjs'/)
  assert.match(fn, /seasons: SEASONS/, 'the seasons come round on the list')
})

test('a poke goes out once, at most two a day', () => {
  assert.match(fn, /state\[i\.key\]\?\.poked_on == null\)\.slice\(0, 2\)/)
  assert.match(fn, /poked_on: today/)
})

test('state is server-only; schedules follow the cron rules', () => {
  assert.match(sql, /alter table public\.coming_up_state enable row level security/)
  assert.doesNotMatch(sql, /create policy/)
  assert.match(sql, /'coming-up-sunday-digest',\s+'0 22 \* \* 0'/)
  assert.match(sql, /'coming-up-daily-pokes',\s+'0 13 \* \* \*'/)
  assert.equal((sql.match(/timeout_milliseconds := 10000/g) ?? []).length, 2)
  assert.equal((sql.match(/vault\.decrypted_secrets/g) ?? []).length, 2)
})
