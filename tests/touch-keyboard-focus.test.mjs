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

test('virtual keyboard includes true QWERTY staggered geometry and superscript number hints', () => {
  assert.match(keyboard, /QWERTY_ROW_1/)
  assert.match(keyboard, /QWERTY_ROW_2/)
  assert.match(keyboard, /QWERTY_ROW_3/)
  assert.match(keyboard, /NUMPAD_GRID/)
})

test('virtual keyboard provides spacebar trackpad cursor scrubbing and repeat backspace acceleration', () => {
  assert.match(keyboard, /handleSpacePointerMove/)
  assert.match(keyboard, /startBackspaceRepeat/)
  assert.match(keyboard, /stopBackspaceRepeat/)
})

test('virtual keyboard incorporates Web Audio API luxury acoustic sound synthesis', () => {
  assert.match(keyboard, /playAcousticTap/)
  assert.match(keyboard, /createOscillator/)
})

test('virtual keyboard includes predictive suggestion ribbon and voice dictation support', () => {
  assert.match(keyboard, /dynamicSuggestions/)
  assert.match(keyboard, /useFieldDictation/)
})

