import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  diversifyFamilyEvidence,
  toFamilyEvidencePacket,
} from '../supabase/functions/_shared/retrieve-family-context.mjs'

const migration = readFileSync(
  new URL('../supabase/migrations/20260807192000_family_data_hybrid_search.sql', import.meta.url),
  'utf8',
)
const performanceMigration = readFileSync(
  new URL('../supabase/migrations/20260807193000_optimize_family_data_hybrid_search.sql', import.meta.url),
  'utf8',
)
const retrieval = readFileSync(
  new URL('../supabase/functions/_shared/retrieve-family-context.mjs', import.meta.url),
  'utf8',
)

test('hybrid search combines semantic, lexical, entity, temporal, state, and recency signals', () => {
  assert.match(migration, /create or replace function public\.search_family_data/)
  assert.match(migration, /embedding <=> query_embedding/)
  assert.match(migration, /ts_rank_cd/)
  assert.match(migration, /entity_score/)
  assert.match(migration, /temporal_score/)
  assert.match(migration, /recency_score/)
  assert.match(migration, /document\.status = 'active'/)
  assert.match(migration, /document\.privacy_class = 'standard'/)
})

test('hybrid search limits vector and lexical candidates before full scoring', () => {
  assert.match(performanceMigration, /semantic_candidates as/)
  assert.match(performanceMigration, /lexical_candidates as/)
  assert.match(performanceMigration, /candidate_ids as/)
  assert.match(performanceMigration, /order by chunk\.embedding <=> query_embedding/)
  assert.match(performanceMigration, /from candidate_ids\s+join public\.family_data_chunks/)
})

test('retrieval embeds the question and returns a structured evidence contract', () => {
  assert.match(retrieval, /taskType:\s*'RETRIEVAL_QUERY'/)
  assert.match(retrieval, /outputDimensionality:\s*768/)
  assert.match(retrieval, /\.rpc\('search_family_data'/)
  assert.match(retrieval, /sources_considered/)
  assert.match(retrieval, /partial_sources/)
})

test('evidence diversification prevents one source type from crowding out the answer', () => {
  const candidates = [
    ...Array.from({ length: 5 }, (_, index) => ({
      document_id: `email-${index}`,
      chunk_id: `email-chunk-${index}`,
      source_type: 'email',
      source_id: `email-${index}`,
      score: 1 - index * 0.01,
      effective_at: '2026-08-07T12:00:00.000Z',
    })),
    {
      document_id: 'calendar-1',
      chunk_id: 'calendar-chunk-1',
      source_type: 'event',
      source_id: 'calendar-1',
      score: 0.8,
      effective_at: '2026-08-10T12:00:00.000Z',
    },
  ]

  const selected = diversifyFamilyEvidence(candidates, { limit: 4, perSourceLimit: 3 })
  assert.equal(selected.length, 4)
  assert.ok(selected.some((item) => item.source_type === 'event'))
  assert.equal(selected.filter((item) => item.source_type === 'email').length, 3)
})

test('evidence packets retain stable citation IDs and safe source metadata', () => {
  const packet = toFamilyEvidencePacket([
    {
      document_id: 'doc-1',
      chunk_id: 'chunk-1',
      source_type: 'email',
      source_id: 'canonical-1',
      title: 'First day guidance',
      excerpt: 'Wait for teacher direction before bringing summer assignments.',
      effective_at: '2026-08-10T12:00:00.000Z',
      occurred_at: '2026-08-07T12:00:00.000Z',
      expires_at: '2026-12-07T12:00:00.000Z',
      confidence: 0.95,
      metadata: { sender: 'School', subject: 'First day guidance' },
      score: 0.9,
    },
  ])

  assert.equal(packet[0].evidence_id, 'doc-1:chunk-1')
  assert.equal(packet[0].source_type, 'email')
  assert.equal(packet[0].source_id, 'canonical-1')
  assert.match(packet[0].excerpt, /summer assignments/)
})
