import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Test source code contracts
const livingVenue = readFileSync(resolve('src/components/calendar/living-flow/components/LivingVenueCard.tsx'), 'utf8')
const smartPlace = readFileSync(resolve('src/components/calendar/SmartPlaceInput.tsx'), 'utf8')
const googleInput = readFileSync(resolve('src/components/shared/GoogleAddressSearchInput.tsx'), 'utf8')
const placeSearch = readFileSync(resolve('supabase/functions/place-search/index.ts'), 'utf8')
const geoDistance = readFileSync(resolve('src/utils/geoDistance.ts'), 'utf8')

test('geoDistance utility exports coordinate helpers and distance calculation', () => {
  assert.match(geoDistance, /export const DEFAULT_HOUSEHOLD_COORDINATES/)
  assert.match(geoDistance, /export function computeDistanceMiles/)
  assert.match(geoDistance, /export function formatDistanceMiles/)
})

test('LivingVenueCard prioritizes Saved Places above Google Places results', () => {
  // Check that saved / household section appears before Google places in the JSX
  const savedIndex = livingVenue.indexOf('PRIORITY 1: SAVED & HOUSEHOLD SHORTCUTS')
  const googleIndex = livingVenue.indexOf('PRIORITY 2: LOCALIZED GOOGLE PLACES RESULTS')
  assert.ok(savedIndex > 0, 'Saved places priority section should exist')
  assert.ok(googleIndex > 0, 'Google places priority section should exist')
  assert.ok(savedIndex < googleIndex, 'Saved places must appear before Google Places results')
})

test('LivingVenueCard sends localized coordinates and pre-fills entity name when unmapped', () => {
  assert.match(livingVenue, /DEFAULT_HOUSEHOLD_COORDINATES/)
  assert.match(livingVenue, /computeDistanceMiles/)
  assert.match(livingVenue, /formatDistanceMiles/)
  assert.match(livingVenue, /lat:\s*userCoords\.lat/)
  assert.match(livingVenue, /lng:\s*userCoords\.lng/)
  assert.match(livingVenue, /setSearchTerm\(venue\.name\)/)
})

test('LivingVenueCard displays honest Address Needed state when unmapped', () => {
  assert.match(livingVenue, /Address Needed/)
  assert.match(livingVenue, /Mapped/)
})

test('SmartPlaceInput and GoogleAddressSearchInput send localized coordinates to place-search', () => {
  assert.match(smartPlace, /DEFAULT_HOUSEHOLD_COORDINATES/)
  assert.match(smartPlace, /lat:\s*DEFAULT_HOUSEHOLD_COORDINATES\.lat/)
  assert.match(googleInput, /DEFAULT_HOUSEHOLD_COORDINATES/)
  assert.match(googleInput, /lat:\s*DEFAULT_HOUSEHOLD_COORDINATES\.lat/)
})

test('place-search edge function applies locationBias when lat and lng are provided', () => {
  assert.match(placeSearch, /locationBias/)
  assert.match(placeSearch, /latitude:\s*lat/)
  assert.match(placeSearch, /longitude:\s*lng/)
})
