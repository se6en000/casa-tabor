import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL('../supabase/migrations/20260810100000_personal_art_mode.sql', import.meta.url),
  'utf8',
)

test('personal Art Mode migration creates a public image bucket with a size limit', () => {
  assert.match(migration, /insert into storage\.buckets[\s\S]*'personal-artwork'[\s\S]*true[\s\S]*20971520/)
  assert.match(migration, /image\/jpeg/)
  assert.match(migration, /image\/png/)
  assert.match(migration, /image\/webp/)
})

test('personal Art Mode migration protects metadata and storage with explicit policies', () => {
  assert.match(migration, /create table if not exists public\.personal_artwork/)
  assert.match(migration, /alter table public\.personal_artwork enable row level security/)
  assert.match(migration, /create policy "personal artwork is readable"/)
  assert.match(migration, /create policy "personal artwork is writable"/)
  assert.match(migration, /bucket_id = 'personal-artwork'/)
})
