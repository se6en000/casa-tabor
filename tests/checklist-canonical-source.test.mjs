import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL('../supabase/migrations/20260807140000_canonical_event_checklist.sql', import.meta.url),
  'utf8',
)
const enrichEvent = readFileSync(new URL('../supabase/functions/enrich-event/index.ts', import.meta.url), 'utf8')
const executeAiAction = readFileSync(new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url), 'utf8')
const homePage = readFileSync(new URL('../src/pages/HomePage.tsx', import.meta.url), 'utf8')
const briefingPage = readFileSync(new URL('../src/pages/BriefingPage.tsx', import.meta.url), 'utf8')
const generateBriefing = readFileSync(new URL('../supabase/functions/generate-briefing/index.ts', import.meta.url), 'utf8')

test('database projects canonical checklist labels into the legacy enrichment column', () => {
  assert.match(migration, /create or replace function public\.sync_event_checklist_legacy_projection/)
  assert.match(migration, /after insert or update or delete on public\.event_checklist_items/)
  assert.match(migration, /array_agg\(label order by sort_order, created_at, id\)/)
  assert.match(migration, /insert into public\.event_enrichments[\s\S]*on conflict \(event_id\) do update set[\s\S]*what_to_bring = v_labels/)
})

test('canonical migration backfills legacy-only lists and does not recreate enrichment during event deletion', () => {
  assert.match(migration, /insert into public\.event_checklist_items[\s\S]*unnest\(enrichment\.what_to_bring\) with ordinality/)
  assert.match(migration, /not exists \([\s\S]*from public\.event_checklist_items existing[\s\S]*existing\.event_id = enrichment\.event_id/)
  assert.match(migration, /if not exists \([\s\S]*from public\.events[\s\S]*where id = v_event_id[\s\S]*\) then[\s\S]*return null/)
})

test('AI enrichment seeds an empty canonical checklist without overwriting an existing one', () => {
  assert.match(migration, /create or replace function public\.seed_event_checklist_if_empty/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /not exists \([\s\S]*from public\.event_checklist_items/)
  assert.match(enrichEvent, /delete contractFields\.what_to_bring/)
  assert.match(enrichEvent, /sb\.rpc\('seed_event_checklist_if_empty'/)
})

test('AI compatibility edits hydrate legacy bring-list replacements from canonical checklist state', () => {
  assert.match(executeAiAction, /preserveChecklistStateForLegacyBringList/)
  assert.match(executeAiAction, /\.from\('event_checklist_items'\)[\s\S]*\.eq\('event_id', normalized\.eventId\)/)
})

test('Home and Briefing read structured checklist rows rather than legacy what_to_bring', () => {
  assert.match(homePage, /focusEvent\.checklist/)
  assert.doesNotMatch(homePage, /focusEvent\.enrichment\?\.what_to_bring/)
  assert.match(generateBriefing, /event_checklist_items\(label, checked, sort_order\)/)
  assert.match(generateBriefing, /checklist: ev\.event_checklist_items/)
  assert.match(briefingPage, /event\.checklist/)
})

test('Briefing keeps legacy Bring text visible for already-persisted briefing payloads', () => {
  assert.match(briefingPage, /event\.checklist !== undefined[\s\S]*event\.enrichment\?\.what_to_bring/)
  assert.match(briefingPage, /bringLabels/)
})
