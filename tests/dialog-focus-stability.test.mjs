import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const hook = readFileSync(resolve('src/components/ui/useDialogA11y.ts'), 'utf8')
const editor = readFileSync(resolve('src/components/calendar/EventTransportationSection.tsx'), 'utf8')

test('dialog focus lifecycle does not restart when an inline close callback changes', () => {
  assert.match(hook, /const onCloseRef = useRef\(onClose\)/)
  assert.match(hook, /useEffect\(\(\) => \{\s+onCloseRef\.current = onClose\s+\}, \[onClose\]\)/)
  assert.match(hook, /onCloseRef\.current\(\)/)
  assert.match(hook, /\[open, panelRef, closeOnEscape\]/)
  assert.doesNotMatch(hook, /\[open, panelRef, onClose, closeOnEscape\]/)
})

test('typing a custom place name preserves its paired address until a saved place is selected', () => {
  assert.match(editor, /option\.name\.toLowerCase\(\) === name\.toLowerCase\(\)/)
  assert.doesNotMatch(editor, /option\.name\.toLowerCase\(\) === name\.trim\(\)\.toLowerCase\(\)/)
  assert.match(editor, /return match \? \{ \.\.\.match \} : \{ \.\.\.fallback, name \}/)
})
