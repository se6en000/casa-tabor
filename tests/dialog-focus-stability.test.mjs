import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const hook = readFileSync(resolve('src/components/ui/useDialogA11y.ts'), 'utf8')
const editor = readFileSync(resolve('src/components/calendar/EventTransportationSection.tsx'), 'utf8')
const smartPlace = readFileSync(resolve('src/components/calendar/SmartPlaceInput.tsx'), 'utf8')

test('dialog focus lifecycle does not restart when an inline close callback changes', () => {
  assert.match(hook, /const onCloseRef = useRef\(onClose\)/)
  assert.match(hook, /useEffect\(\(\) => \{\s+onCloseRef\.current = onClose\s+\}, \[onClose\]\)/)
  assert.match(hook, /onCloseRef\.current\(\)/)
  assert.match(hook, /\[open, panelRef, closeOnEscape\]/)
  assert.doesNotMatch(hook, /\[open, panelRef, onClose, closeOnEscape\]/)
})

test('typing a custom place name preserves its paired address until a saved place is selected', () => {
  assert.match(editor, /<SmartPlaceInput/)
  assert.match(smartPlace, /onChange\(\{[\s\S]{0,100}\.\.\.value,[\s\S]{0,80}\[field\]: event\.target\.value,/)
  assert.match(smartPlace, /name: suggestion\.name,[\s\S]*address: suggestion\.address/)
})

test('smart place fields filter saved places immediately and debounce Google lookup', () => {
  assert.match(smartPlace, /filter\(\(place\) => matchesQuery\(place, query\)\)/)
  assert.match(smartPlace, /window\.setTimeout\(async \(\) =>/)
  assert.match(smartPlace, /\}, 350\)/)
  assert.match(smartPlace, /supabase\.functions\.invoke\('place-search'/)
  assert.match(smartPlace, /onPointerDown=\{\(event\) => event\.preventDefault\(\)\}/)
})
