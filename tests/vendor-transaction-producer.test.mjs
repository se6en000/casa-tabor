import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const scanner = readFileSync(new URL('../supabase/functions/scan-gmail-inbox/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260809201500_vendor_transaction_threads.sql', import.meta.url), 'utf8')
const fallbackMigration = readFileSync(new URL('../supabase/migrations/20260809203000_refine_vendor_transaction_fallback.sql', import.meta.url), 'utf8')
const home = readFileSync(new URL('../src/components/home/HomeRightPanel.tsx', import.meta.url), 'utf8')
const actionCenter = readFileSync(new URL('../src/pages/ActionHubPage.tsx', import.meta.url), 'utf8')

test('Gmail action extraction stores reusable vendor transaction identity', () => {
  assert.match(scanner, /vendor\?: string/)
  assert.match(scanner, /transaction_id\?: string/)
  assert.match(scanner, /transaction_status\?: string/)
  assert.match(scanner, /attention_thread_key:/)
  assert.match(scanner, /attention_vendor:/)
  assert.match(scanner, /attention_stage:/)
  assert.match(scanner, /transactionDescriptor/)
  assert.match(scanner, /items:\$\{descriptor\}/)
})

test('migration adds indexed transaction identity and backfills current Walmart rows', () => {
  assert.match(migration, /add column if not exists attention_thread_key text/)
  assert.match(migration, /prep_items_attention_thread_idx/)
  assert.match(migration, /attention_vendor = 'Walmart'/)
  assert.match(migration, /transaction:walmart:/)
  assert.match(migration, /regexp_match/)
  assert.match(fallbackMigration, /transaction:walmart:items:/)
  assert.match(fallbackMigration, /attention_thread_key like 'transaction:walmart:message:%'/)
})

test('Home and Action Center label grouped transactions as updates', () => {
  assert.match(home, /topic\.transactionVendor/)
  assert.match(home, /topic\.transactionVendor \? 'updates' : 'signals'/)
  assert.match(actionCenter, /topic\.transactionVendor/)
  assert.match(actionCenter, /topic\.transactionVendor \? 'updates' : 'signals'/)
})
