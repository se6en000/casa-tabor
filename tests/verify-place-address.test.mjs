import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { verifyPlaceAddress } from '../supabase/functions/_shared/verify-place-address.mjs'

test('verifyPlaceAddress returns Google-verified split fields when a place is found', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      places: [{
        displayName: { text: 'Shoot Straight' },
        formattedAddress: '5533 Okeechobee Blvd, West Palm Beach, FL 33417, USA',
        addressComponents: [
          { longText: '5533', types: ['street_number'] },
          { longText: 'Okeechobee Boulevard', shortText: 'Okeechobee Blvd', types: ['route'] },
          { longText: 'West Palm Beach', types: ['locality'] },
          { longText: 'Florida', shortText: 'FL', types: ['administrative_area_level_1'] },
          { longText: '33417', types: ['postal_code'] },
        ],
        location: { latitude: 26.7, longitude: -80.1 },
      }],
    }),
  })
  const result = await verifyPlaceAddress({ fetchImpl, apiKey: 'test-key', query: 'Shoot Straight West Palm Beach' })
  assert.equal(result.verified, true)
  assert.equal(result.street, '5533 Okeechobee Blvd')
  assert.equal(result.city, 'West Palm Beach')
  assert.equal(result.state, 'FL')
  assert.equal(result.zip, '33417')
  assert.equal(result.lat, 26.7)
  assert.equal(result.lng, -80.1)
})

test('verifyPlaceAddress returns unverified when Google finds no match', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ places: [] }) })
  const result = await verifyPlaceAddress({ fetchImpl, apiKey: 'test-key', query: 'totally made up place xyz' })
  assert.equal(result.verified, false)
  assert.equal(result.street, null)
  assert.equal(result.city, null)
})

test('verifyPlaceAddress returns unverified on fetch failure without throwing', async () => {
  const fetchImpl = async () => { throw new Error('network down') }
  const result = await verifyPlaceAddress({ fetchImpl, apiKey: 'test-key', query: 'some place' })
  assert.equal(result.verified, false)
})

test('verifyPlaceAddress returns unverified when query or apiKey is missing', async () => {
  const fetchImpl = async () => { throw new Error('should not be called') }
  assert.equal((await verifyPlaceAddress({ fetchImpl, apiKey: '', query: 'some place' })).verified, false)
  assert.equal((await verifyPlaceAddress({ fetchImpl, apiKey: 'test-key', query: '' })).verified, false)
})

const executeSource = readFileSync(
  new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url),
  'utf8',
)
const associateSource = executeSource.slice(
  executeSource.indexOf("if (tool === 'associate_contact_place')"),
  executeSource.indexOf('appendActionTrace(\'server_ai_action_succeeded\', \'associate_contact_place\''),
)

test('associate_contact_place verifies and splits the address instead of saving the raw AI-provided string', () => {
  assert.match(executeSource, /import \{ verifyPlaceAddress \} from '\.\.\/_shared\/verify-place-address\.mjs'/)
  assert.match(associateSource, /verifyPlaceAddress\(/)
  assert.match(associateSource, /city:\s*verified/)
  assert.match(associateSource, /state:\s*verified/)
  assert.match(associateSource, /zip:\s*verified/)
})

const backfillSource = readFileSync(
  new URL('../scripts/backfill-saved-place-address-components.mjs', import.meta.url),
  'utf8',
)

test('saved_places address-component backfill is dry-run by default and requires a snapshot to apply', () => {
  assert.match(backfillSource, /process\.argv\.includes\('--apply'\)/)
  assert.match(backfillSource, /--apply requires --snapshot <path>/)
  assert.match(backfillSource, /verifyPlaceAddress\(/)
  assert.match(backfillSource, /if \(!apply\) \{/)
  assert.match(backfillSource, /writeFile\(\s*snapshotPath/)
  assert.match(backfillSource, /city\.is\.null,state\.is\.null,zip\.is\.null/)
})
