import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const scanner = readFileSync(new URL('../supabase/functions/scan-gmail-inbox/index.ts', import.meta.url), 'utf8')

// The vendor-spend feature (see tests/vendor-spend-summary.test.mjs) needs a real,
// trustworthy amount per transaction going forward, not the render-time regex the
// UI has always used for display. Live verification of the historical backfill
// (same regex, run against old rows) found real false positives: a "Watch the
// Patriots vs. Seahawks" reminder counted as a ~$45 expense, "eWallet Funds
// Added" notices (money coming IN) counted as spend, and a failed Zelle payment
// counted as if it succeeded. The classifier prompt below is the actual fix --
// asking the LLM to reason about whether a dollar figure is really this
// transaction's settled total, not just present somewhere in the email.

test('classifier schema asks for a transaction amount, not just vendor/type', () => {
  assert.match(scanner, /amount\?: string/)
  assert.match(scanner, /"amount":/)
})

test('the amount prompt explicitly excludes the false-positive classes found in the noisy regex backfill', () => {
  assert.match(scanner, /FAILED\/declined\/reversed payment/)
  assert.match(scanner, /money added\/deposited\/received/)
  assert.match(scanner, /a price merely mentioned in passing/)
})

test('parseAmountCents only accepts a clean, positive dollar figure', () => {
  assert.match(scanner, /function parseAmountCents\(amount\?: string\): number \| null/)
  assert.match(scanner, /if \(!Number\.isFinite\(numeric\) \|\| numeric <= 0\) return null/)
})

test('amount_cents is persisted on both insert and thread-progression update paths', () => {
  assert.match(scanner, /const amountCents = parseAmountCents\(a\.amount\)/)
  assert.match(scanner, /amount_cents: amountCents,/)
  // A later email in the same transaction thread (e.g. "shipped") often omits
  // the amount the confirmation email had -- the update path must never let a
  // later, amount-less message erase an already-known real amount.
  assert.match(scanner, /select\('id, attention_stage, type, description, amount_cents'\)/)
  assert.match(scanner, /amount_cents: amountCents \?\? existing\.amount_cents,/)
})
