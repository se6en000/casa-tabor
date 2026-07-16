import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve('src/components/calendar/EventEditSheet.tsx'), 'utf8')

test('event Edit Details uses shared saved and Google search for both location fields', () => {
  assert.match(source, /import SmartPlaceInput from '\.\/SmartPlaceInput'/)
  assert.equal((source.match(/<SmartPlaceInput/g) ?? []).length, 2)
  assert.match(source, /field="name"[\s\S]{0,240}onChange=\{updateLocation\}/)
  assert.match(source, /field="address"[\s\S]{0,520}onChange=\{updateLocation\}/)
  assert.doesNotMatch(source, /showLocationSuggest|useSavedPlaces/)
})

test('a selected place updates the location name and address as one pair', () => {
  assert.match(source, /const updateLocation = \(place: TransportationPlace\) => \{\s*setLocation\(place\.name\)\s*setAddress\(place\.address\)\s*markDirty\(\)\s*\}/)
  assert.equal((source.match(/value=\{\{ name: location, address, source: 'manual' \}\}/g) ?? []).length, 2)
})

test('address-only clearing preserves the current location name', () => {
  assert.match(source, /onClear=\{\(\) => updateLocation\(\{\s*name: location,\s*address: '',\s*source: 'manual',\s*\}\)\}/)
})

test('edit sheet keeps changes local until explicit Save and Close actions', () => {
  assert.match(source, /const handleClose = \(\) => \{\s*onClose\(\)\s*\}/)
  assert.doesNotMatch(source, /autoSave/)
  assert.doesNotMatch(source, /isDirtyRef/)
})
