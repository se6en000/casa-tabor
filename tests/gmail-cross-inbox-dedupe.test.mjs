import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const scanner = readFileSync(new URL('../supabase/functions/scan-gmail-inbox/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(
  new URL('../supabase/migrations/20260807180000_canonical_inbox_email_knowledge.sql', import.meta.url),
  'utf8',
)

test('migration persists canonical email identity and links each mailbox delivery to it', () => {
  assert.match(migration, /create table if not exists public\.canonical_inbox_emails/)
  assert.match(migration, /canonical_key text not null unique/)
  assert.match(migration, /add column if not exists canonical_email_id uuid/)
  assert.match(migration, /gmail_processed_messages_canonical_email_idx/)
})

test('scanner canonicalizes normalized mail before candidate classification and skips later inbox copies', () => {
  assert.match(scanner, /canonicalEmailKey\(\{/)
  assert.match(scanner, /canonicalContentFingerprint\(details\.body\)/)
  assert.match(scanner, /from\('canonical_inbox_emails'\)/)
  assert.match(scanner, /eq\('canonical_email_id', canonicalEmail\.id\)/)
  assert.match(scanner, /duplicate delivery of canonical inbox email/)
  assert.match(scanner, /const searchText = `\$\{details\.subject\}\\n\$\{details\.snippet\}\\n\$\{details\.body\}`/)
})

test('scanner keeps the canonical email link on every terminal processed-message outcome', () => {
  const terminalWrites = [...scanner.matchAll(/family_member_id: memberId, gmail_message_id: msgId,\n\s+canonical_email_id: canonicalEmail\.id,/g)]
  assert.ok(terminalWrites.length >= 8, `expected canonical link on terminal writes, found ${terminalWrites.length}`)
})

test('actionable email outcomes create source-backed expiring knowledge claims', () => {
  assert.match(migration, /create table if not exists public\.family_knowledge_claims/)
  assert.match(migration, /expires_at timestamptz/)
  assert.match(migration, /privacy_class text not null/)
  assert.match(scanner, /persistEmailKnowledgeClaims/)
  assert.match(scanner, /canonical_email_id: canonicalEmailId/)
  assert.match(scanner, /claim_type: 'commitment'/)
  assert.match(scanner, /source_type: 'gmail'/)
})
