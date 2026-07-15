import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const keyboard = readFileSync(
  new URL('../src/components/shared/TouchKeyboard.tsx', import.meta.url),
  'utf8',
)

test('virtual keyboard buttons preserve the active editable field', () => {
  assert.match(keyboard, /onPointerDownCapture=\{preserveEditableFocus\}/)
  assert.match(keyboard, /pressedElement\.closest\('button'\)/)
  assert.match(keyboard, /event\.preventDefault\(\)/)
})
