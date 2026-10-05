import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The week's report (Oct 4): "Olympia Park, Wellington, Florida" found no weather; a bare "Wellington" came back as
// Wellington, New Zealand (checked Oct 5). Now the place is found the way the app finds places — near home — then a US
// town by name; the answer names where it looked.
const src = readFileSync(new URL('../supabase/functions/ai-assistant/lookups.ts', import.meta.url), 'utf8')
const fn = src.slice(src.indexOf('export function weatherPlaceQuery'), src.indexOf('export const LOOKUP_TOOL_NAMES'))
const weatherPlaceQuery = new Function(`${fn.replace('export ', '').replace(/: string/g, '')}; return weatherPlaceQuery`)()

test('a bare name is looked for near home; a name with its town or state as said', () => {
  assert.equal(weatherPlaceQuery('Wellington', 'West Palm Beach'), 'Wellington near West Palm Beach')
  assert.equal(weatherPlaceQuery('Ferrin Park', 'West Palm Beach'), 'Ferrin Park near West Palm Beach')
  assert.equal(weatherPlaceQuery('Olympia Park, Wellington, Florida', 'West Palm Beach'), 'Olympia Park, Wellington, Florida')
  assert.equal(weatherPlaceQuery('Dallas TX', 'West Palm Beach'), 'Dallas TX')
})

test('the place first (Google, US), then a US town; never a town abroad; the answer says where', () => {
  assert.match(src, /textQuery: weatherPlaceQuery\(location, String\(context\.homeCity \?\? ''\)\), maxResultCount: 1, regionCode: 'US'/)
  assert.match(src, /geoUrl\.searchParams\.set\('countryCode', 'US'\)/)
  assert.match(src, /location: place\.label,/)
})
