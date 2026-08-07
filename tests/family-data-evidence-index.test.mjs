import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL('../supabase/migrations/20260807190000_family_data_evidence_index.sql', import.meta.url),
  'utf8',
)
const worker = readFileSync(
  new URL('../supabase/functions/index-family-data/index.ts', import.meta.url),
  'utf8',
)
const projections = readFileSync(
  new URL('../supabase/migrations/20260807191000_family_data_projection_queue.sql', import.meta.url),
  'utf8',
)
const projectionHelper = readFileSync(
  new URL('../supabase/functions/_shared/family-data-projection.mjs', import.meta.url),
  'utf8',
)

test('family evidence index stores canonical documents, chunks, and idempotent jobs', () => {
  assert.match(migration, /create table if not exists public\.family_data_documents/)
  assert.match(migration, /unique \(source_type, source_id\)/)
  assert.match(migration, /create table if not exists public\.family_data_chunks/)
  assert.match(migration, /embedding extensions\.vector\(768\)/)
  assert.match(migration, /search_vector tsvector/)
  assert.match(migration, /create table if not exists public\.family_data_index_queue/)
  assert.match(migration, /unique \(source_type, source_id\)/)
})

test('family evidence index enforces privacy, lifecycle, and bounded email retention', () => {
  assert.match(migration, /privacy_class in \('standard', 'sensitive', 'excluded'\)/)
  assert.match(migration, /status in \('active', 'superseded', 'expired', 'dismissed', 'deleted'\)/)
  assert.match(migration, /source_type in \('email', 'event', 'reminder', 'prep', 'activity', 'person', 'place', 'relationship', 'memory'\)/)
  assert.match(migration, /retention_interval interval default interval '4 months'/)
  assert.match(migration, /delete from public\.family_data_documents[\s\S]*source_type = 'email'/)
})

test('family evidence index is private by default and service-role writable', () => {
  for (const table of ['family_data_documents', 'family_data_chunks', 'family_data_index_queue']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
    assert.match(migration, new RegExp(`on public\\.${table}[\\s\\S]*to service_role`))
  }
  assert.doesNotMatch(migration, /using \(true\) with check \(true\)/)
})

test('index jobs are claimed with locking and processed into 768-dimension chunks', () => {
  assert.match(migration, /create or replace function public\.claim_family_data_index_jobs/)
  assert.match(migration, /for update skip locked/)
  assert.match(worker, /claim_family_data_index_jobs/)
  assert.match(worker, /const EMBEDDING_MODEL = 'gemini-embedding-001'/)
  assert.match(worker, /:batchEmbedContents/)
  assert.match(worker, /outputDimensionality:\s*768/)
  assert.match(worker, /chunkFamilyEvidenceText/)
  assert.match(worker, /\.from\('family_data_chunks'\)/)
  assert.match(worker, /status:\s*'failed'/)
})

test('authoritative family sources enqueue projection refreshes and deletions', () => {
  for (const table of [
    'events',
    'event_enrichments',
    'event_members',
    'event_checklist_items',
    'event_action_items',
    'prep_items',
    'notifications',
    'saved_contacts',
    'saved_places',
    'family_contact_relationships',
    'contact_place_relationships',
    'ai_memory_observations',
  ]) {
    assert.match(projections, new RegExp(`on public\\.${table}`), table)
  }
  assert.match(projections, /tg_op = 'DELETE'/)
  assert.match(projections, /queue_family_data_projection\(old_source_type, old\.id::text, 'delete'\)/)
  assert.match(projections, /on conflict \(source_type, source_id\) do update/)
})

test('index worker hydrates queued authoritative sources before embedding', () => {
  for (const sourceType of ['event', 'reminder', 'prep', 'activity', 'person', 'place', 'relationship', 'memory']) {
    assert.match(worker, new RegExp(`case '${sourceType}'`), sourceType)
  }
  assert.match(worker, /hydrateAuthoritativeDocument/)
  assert.match(projectionHelper, /privacy_class:\s*'standard'/)
})
