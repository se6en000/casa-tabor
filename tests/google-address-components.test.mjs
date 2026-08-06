import test from 'node:test'
import assert from 'node:assert/strict'
import { parseGoogleAddressComponents } from '../supabase/functions/_shared/google-address-components.mjs'

// Google Places API (New) returns structured address_components with
// long/short text + type tags. We use these directly instead of splitting a
// formattedAddress string, so saved_places.city/state/zip are reliably
// populated instead of the whole address being dumped into one field.

const edgewoodComponents = [
  { longText: '238', shortText: '238', types: ['street_number'] },
  { longText: 'Greenwood Drive', shortText: 'Greenwood Dr', types: ['route'] },
  { longText: 'West Palm Beach', shortText: 'West Palm Beach', types: ['locality', 'political'] },
  { longText: 'Palm Beach County', shortText: 'Palm Beach County', types: ['administrative_area_level_2', 'political'] },
  { longText: 'Florida', shortText: 'FL', types: ['administrative_area_level_1', 'political'] },
  { longText: 'United States', shortText: 'US', types: ['country', 'political'] },
  { longText: '33405', shortText: '33405', types: ['postal_code'] },
]

test('parseGoogleAddressComponents splits a full Google result into street/city/state/zip', () => {
  const result = parseGoogleAddressComponents(edgewoodComponents)
  assert.deepEqual(result, {
    street: '238 Greenwood Dr',
    city: 'West Palm Beach',
    state: 'FL',
    zip: '33405',
  })
})

test('parseGoogleAddressComponents returns nulls for missing fields instead of throwing', () => {
  const result = parseGoogleAddressComponents([
    { longText: 'Some Plaza', shortText: 'Some Plaza', types: ['establishment'] },
  ])
  assert.deepEqual(result, { street: null, city: null, state: null, zip: null })
})

test('parseGoogleAddressComponents handles a missing/undefined components array', () => {
  assert.deepEqual(parseGoogleAddressComponents(undefined), { street: null, city: null, state: null, zip: null })
  assert.deepEqual(parseGoogleAddressComponents([]), { street: null, city: null, state: null, zip: null })
})

// ── place-search edge function returns parsed street/city/state/zip ──
import { readFileSync } from 'node:fs'
const placeSearchSource = readFileSync(
  new URL('../supabase/functions/place-search/index.ts', import.meta.url),
  'utf8',
)

test('place-search edge function requests addressComponents and returns parsed street/city/state/zip', () => {
  assert.match(placeSearchSource, /import \{ parseGoogleAddressComponents \} from '\.\.\/_shared\/google-address-components\.mjs'/)
  assert.match(placeSearchSource, /places\.addressComponents/)
  assert.match(placeSearchSource, /const parsed = parseGoogleAddressComponents\(p\.addressComponents\)/)
  assert.match(placeSearchSource, /city: parsed\.city/)
  assert.match(placeSearchSource, /state: parsed\.state/)
  assert.match(placeSearchSource, /zip: parsed\.zip/)
})
