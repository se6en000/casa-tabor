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
