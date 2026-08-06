import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { pickBestDirectoryMatch } from '../supabase/functions/_shared/directory-match.mjs'

// ── Pure matcher logic ──

test('pickBestDirectoryMatch returns null for no rows / empty input', () => {
  assert.equal(pickBestDirectoryMatch(null), null)
  assert.equal(pickBestDirectoryMatch([]), null)
  assert.equal(pickBestDirectoryMatch([{ score: 0.2 }]), null) // below default 0.6 threshold
})

test('pickBestDirectoryMatch picks the highest-scoring row above threshold', () => {
  const rows = [
    { id: 'a', score: 0.65 },
    { id: 'b', score: 0.9 },
    { id: 'c', score: 0.7 },
  ]
  assert.equal(pickBestDirectoryMatch(rows)?.id, 'b')
})

test('pickBestDirectoryMatch honors a custom threshold', () => {
  const rows = [{ id: 'a', score: 0.5 }]
  assert.equal(pickBestDirectoryMatch(rows, { threshold: 0.6 }), null)
  assert.equal(pickBestDirectoryMatch(rows, { threshold: 0.4 })?.id, 'a')
})

test('pickBestDirectoryMatch can require confirmed rows only', () => {
  const rows = [
    { id: 'unconfirmed', score: 0.95, confirmed: false },
    { id: 'confirmed', score: 0.65, confirmed: true },
  ]
  assert.equal(pickBestDirectoryMatch(rows, { requireConfirmed: true })?.id, 'confirmed')
  assert.equal(pickBestDirectoryMatch(rows)?.id, 'unconfirmed')
})

// ── enrich-event: prefer saved_contacts over the raw LLM contact guess ──

const enrichEventSource = readFileSync(
  new URL('../supabase/functions/enrich-event/index.ts', import.meta.url),
  'utf8',
)

test('enrich-event resolves contact_name/contact_phone against find_similar_contacts before upsert', () => {
  assert.match(enrichEventSource, /import\s*\{\s*pickBestDirectoryMatch\s*\}\s*from\s*'\.\.\/_shared\/directory-match\.mjs'/)
  assert.match(enrichEventSource, /\.rpc\('find_similar_contacts',/)
  const upsertIndex = enrichEventSource.indexOf(".from('event_enrichments')\n    .upsert(")
  const rpcIndex = enrichEventSource.indexOf(".rpc('find_similar_contacts',")
  assert.ok(rpcIndex > -1 && upsertIndex > -1 && rpcIndex < upsertIndex, 'contact resolution must run before the event_enrichments upsert')
  assert.match(enrichEventSource, /requireConfirmed:\s*true/)
  assert.match(enrichEventSource, /contractFields\.contact_name\s*=\s*matchedContact\.name/)
  assert.match(enrichEventSource, /contractFields\.contact_phone\s*=\s*matchedContact\.phone/)
})

// ── execute-ai-action: create_event location resolves against find_similar_places ──

const executeActionSource = readFileSync(
  new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url),
  'utf8',
)
const createEventSource = executeActionSource.slice(
  executeActionSource.indexOf("if (tool === 'create_event')"),
  executeActionSource.indexOf("if (tool === 'create_recipe')"),
)

test('create_event resolves location against find_similar_places before inserting', () => {
  assert.match(createEventSource, /\.rpc\('find_similar_places',\s*\{\s*p_name:\s*normalizedLocation/)
  assert.match(createEventSource, /pickBestDirectoryMatch/)
  assert.match(createEventSource, /location_name:\s*resolvedLocationName/)
  assert.match(createEventSource, /address:\s*resolvedAddress/)
  assert.match(createEventSource, /lat:\s*resolvedLat/)
  assert.match(createEventSource, /lng:\s*resolvedLng/)
})

// ── execute-ai-action: create_event fires enrich-event only for reminders ──
//
// A pre-existing DB trigger (auto_enrich_on_insert →
// public.trigger_enrich_event, see
// supabase/migrations/20260719130000_harden_auto_enrichment_dispatch.sql)
// already calls enrich-event on every event insert *except* record_kind =
// 'series_template' and event_type = 'reminder'. So calendar events created
// via create_event are already auto-enriched by that trigger — firing
// enrich-event again here for them would just double the LLM call. Reminders
// are the one gap the DB trigger leaves open, so this handler only needs to
// cover that case.

test('create_event fires enrich-event fire-and-forget only for reminders, without blocking the response', () => {
  // Must invoke enrich-event with the new event's id
  assert.match(createEventSource, /sb\.functions\.invoke\('enrich-event',\s*\{\s*body:\s*\{\s*event_id:\s*event\.id/)
  // Must be gated to reminders only — the DB trigger already covers every other event type.
  const invokeIndex = createEventSource.indexOf("sb.functions.invoke('enrich-event'")
  const precedingLines = createEventSource.slice(Math.max(0, invokeIndex - 200), invokeIndex)
  assert.match(precedingLines, /normalizedEventType\s*===\s*'reminder'/, 'enrich-event invoke must be gated to reminders — the DB trigger already auto-enriches all other event types')
  // Must not be awaited (fire-and-forget), matching the update_event pattern elsewhere in this file
  const precedingChars = createEventSource.slice(Math.max(0, invokeIndex - 10), invokeIndex)
  assert.doesNotMatch(precedingChars, /await\s*$/, 'enrich-event invoke must not be awaited in create_event')
  // Must have a .catch so a failed enrichment invoke can't throw and break create_event's response
  assert.match(createEventSource.slice(invokeIndex, invokeIndex + 200), /\.catch\(/)
  // Must pass target_fields (targeted mode) so enrich-event fills contact/logistics
  // but never overwrites the location_name/address this handler already resolved
  // above — see assistant-execute-ai-action.test.mjs for the location-protection contract.
  assert.match(createEventSource.slice(invokeIndex, invokeIndex + 200), /target_fields:\s*ENRICHMENT_FIELDS/)
})
