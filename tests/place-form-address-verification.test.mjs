import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

// ── Bug fix: the standalone "Add/Edit Place" form (Saved Places tab) never
// verified addresses through Google, unlike DirectoryPlaceInput and
// execute-ai-action. Users could save a place with a full address typed into
// "Name" and every address field left blank (e.g. "100 Greenwood Drive, West
// Palm Beach, FL" with address/city/state/zip all null). This adds a shared,
// Google-verified address search input and makes the address fields required
// so a place can no longer be saved without a real address. ──

const componentSource = readFileSync(
  new URL('../src/components/shared/GoogleAddressSearchInput.tsx', import.meta.url),
  'utf8',
)

test('GoogleAddressSearchInput searches Google Places live as the user types', () => {
  assert.match(componentSource, /supabase\.functions\.invoke\('place-search'/)
})

test('GoogleAddressSearchInput debounces search requests', () => {
  assert.match(componentSource, /window\.setTimeout/)
})

test('GoogleAddressSearchInput reports the verified, split address components on selection', () => {
  assert.match(componentSource, /onSelect\(/)
  assert.match(componentSource, /street:/)
  assert.match(componentSource, /city:/)
  assert.match(componentSource, /state:/)
  assert.match(componentSource, /zip:/)
  assert.match(componentSource, /lat:/)
  assert.match(componentSource, /lng:/)
})

const savedPlacesSettingsSource = readFileSync(
  new URL('../src/pages/SavedPlacesSettingsPage.tsx', import.meta.url),
  'utf8',
)

test('PlaceForm uses GoogleAddressSearchInput to verify the street address instead of a raw text input', () => {
  assert.match(savedPlacesSettingsSource, /import GoogleAddressSearchInput from '\.\.\/components\/shared\/GoogleAddressSearchInput'/)
  assert.match(savedPlacesSettingsSource, /<GoogleAddressSearchInput/)
})

test('PlaceForm requires street, city, state, and zip before a place can be saved', () => {
  const placeFormBody = savedPlacesSettingsSource.slice(
    savedPlacesSettingsSource.indexOf('function PlaceForm('),
    savedPlacesSettingsSource.indexOf('// ── Place row'),
  )
  assert.match(placeFormBody, /<GoogleAddressSearchInput[\s\S]{0,200}required/)
  assert.match(placeFormBody, /City \*/)
  assert.match(placeFormBody, /State \*/)
  assert.match(placeFormBody, /ZIP \*/)
  assert.match(placeFormBody, /required value=\{form\.city/)
  assert.match(placeFormBody, /required value=\{form\.state/)
  assert.match(placeFormBody, /required value=\{form\.zip/)
})

test('SavedPlaceInput allows lat/lng so a Google-verified address can be persisted on save', () => {
  assert.match(
    savedPlacesSettingsSource,
    /type SavedPlaceInput = Omit<SavedPlace, 'id' \| 'google_place_id' \| 'last_seen_at' \| 'dismissed_at' \| 'created_at' \| 'updated_at'>/,
  )
})

// ── Bug fix (root cause #3): discover_directory_candidates() (the
// auto-discovery SQL function that turns event history into unconfirmed
// place suggestions) inserts a raw location string straight into
// saved_places.address with no Google verification or split at all, since
// Postgres can't call the Google Places API. Those unconfirmed rows sit
// with blank city/state/zip until a household member confirms them in the
// Household Directory settings page — so confirming is the right chokepoint
// to verify/split the address, regardless of which process created the row. ──
test('Confirming a suggested place re-verifies its address through Google before marking it confirmed', () => {
  const confirmMutationBody = savedPlacesSettingsSource.slice(
    savedPlacesSettingsSource.indexOf('const confirmPlaceMutation = useMutation('),
    savedPlacesSettingsSource.indexOf('const dismissPlaceMutation = useMutation('),
  )
  assert.match(confirmMutationBody, /supabase\.functions\.invoke\('place-search'/)
  assert.match(confirmMutationBody, /confirmed: true/)
})

test('Confirm button passes the full place record so its address can be re-verified', () => {
  assert.match(savedPlacesSettingsSource, /onConfirm=\{\(\) => confirmPlaceMutation\.mutate\(place\)\}/)
})
