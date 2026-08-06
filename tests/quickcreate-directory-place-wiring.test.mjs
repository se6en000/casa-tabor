import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('../src/components/shared/QuickCreateSheet.tsx', import.meta.url),
  'utf8',
)

test('QuickCreateSheet location field uses DirectoryPlaceInput instead of free text', () => {
  assert.match(source, /import DirectoryPlaceInput from '\.\.\/shared\/DirectoryPlaceInput'|import DirectoryPlaceInput from '\.\/DirectoryPlaceInput'/)
  assert.match(source, /resolveDirectoryPlaceSave/)
  assert.match(source, /type DirectoryPlaceSelection/)
  assert.match(source, /<DirectoryPlaceInput/)
  // The old plain-text location input/state must be gone so a typed string
  // can no longer bypass the saved_places lookup-first flow.
  assert.doesNotMatch(source, /useState\(''\)\s*\/\/\s*location|const \[location, setLocation\]/)
})

test('QuickCreateSheet resolves the place selection to an existing or newly-created saved_places row before insert', () => {
  assert.match(source, /useSavedPlaces/)
  assert.match(source, /resolveDirectoryPlaceSave\(\s*placeSelection/)
  assert.match(source, /action === 'create-and-link'/)
  assert.match(source, /action === 'link'/)
  // Address/lat/lng resolved from the matched place must flow onto the event
  // row so newly created events get a real address up front (driving plan).
  const insertIndex = source.indexOf(".from('events').insert(")
  const insertBlock = source.slice(insertIndex, insertIndex + 600)
  assert.match(insertBlock, /location_name:/)
  assert.match(insertBlock, /address:/)
  assert.match(insertBlock, /lat:/)
  assert.match(insertBlock, /lng:/)
})
