import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Casa reads the email, phase 4 (2026-09-30): the old scanner stops writing "needs you" items; the mail
// fetch, the read log and the new reader's trigger stay. The open ones were closed by migration 20261001170000.
const src = readFileSync(new URL('../supabase/functions/scan-gmail-inbox/index.ts', import.meta.url), 'utf8')
const body = (name) => src.slice(src.indexOf(`async function ${name}(`), src.indexOf(`async function ${name}(`) + 900)

test('the old scanner writes no needs-you items or suggestions, and asks no model for them', () => {
  assert.match(src, /const OLD_NEEDS_YOU_ITEMS = false/)
  for (const name of ['persistInboxActions', 'persistEventSuggestions']) {
    assert.match(body(name), /\): Promise<number> \{\n  if \(!OLD_NEEDS_YOU_ITEMS\) return 0\n/, name)
  }
  assert.match(src, /OLD_NEEDS_YOU_ITEMS && \(isActionCandidate \|\| isUserLabeled\) && !backfillFamilyEvidenceOnly\s+\? extractInboxActions\(/)
})

test('it still hands new mail to the new reader', () => {
  assert.match(src, /email-reader/)
  assert.match(src, /EdgeRuntime\.waitUntil/)
})
