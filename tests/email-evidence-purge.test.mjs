import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Casa reads the email, phase 4 (2026-09-30): the old email records are kept no longer than 30 days.
const sql = readFileSync(new URL('../supabase/migrations/20261001190000_email_evidence_purge_30_days.sql', import.meta.url), 'utf8')

test('the old email-evidence purge runs nightly again, at 30 days', () => {
  assert.match(sql, /jobname = 'purge-expired-family-email-evidence'/)
  assert.match(sql, /purge_expired_family_email_evidence\(interval '30 days'\)/)
  assert.match(sql, /active := true/)
})
