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

test('autosave serializes a newer place selection behind an in-flight text save', () => {
  assert.match(source, /const autoSaveInFlightRef = useRef<Promise<void> \| null>\(null\)/)
  assert.match(source, /if \(autoSaveInFlightRef\.current\) \{\s*await autoSaveInFlightRef\.current\s*if \(isDirtyRef\.current\) await runAutoSaveRef\.current\(\)/)
  assert.match(source, /autoSaveTimerRef\.current = setTimeout\(\(\) => void runAutoSaveRef\.current\(\), 1500\)/)
})

test('closing during autosave flushes the latest dirty place before dismissing', () => {
  assert.match(source, /if \(!isInstance && \(isSaving \|\| isDirtyRef\.current\)\)/)
  assert.match(source, /if \(autoSaveInFlightRef\.current\) await autoSaveInFlightRef\.current\s*if \(isDirtyRef\.current\) await runAutoSaveRef\.current\(\)/)
  assert.match(source, /void flushLatestSave\(\)\.finally\(\(\) => onClose\(\)\)/)
})
