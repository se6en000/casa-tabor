import test from 'node:test'
import assert from 'node:assert/strict'
import { usesDeviceKeyboard } from '../src/wall/keyboardMode.ts'

// Overnight queue (2), Jake 2026-09-29: "when opening this app on a desktop, I want to use the native
// keyboard on that desktop and not see the Casa version (it's nice and all but not convenient if I have
// a physical keyboard available)." The kiosk keeps Casa's keyboard (its touchscreen can read as a mouse
// under X11, so the pointer can't tell); every other device types with its own.

test('the kiosk keeps Casa’s keyboard', () => {
  assert.equal(usesDeviceKeyboard({ search: '?kiosk=1&density=kiosk', kioskFlag: null }), false)
  assert.equal(usesDeviceKeyboard({ search: '', kioskFlag: '1' }), false, 'the browser marked as the kiosk')
  assert.equal(usesDeviceKeyboard({ search: '?density=kiosk', kioskFlag: null }), false)
})

test('a desktop, laptop or tablet types with its own keyboard', () => {
  assert.equal(usesDeviceKeyboard({ search: '', kioskFlag: null }), true)
  assert.equal(usesDeviceKeyboard({ search: '', kioskFlag: '0' }), true)
})

test('either can be asked for by name (tests, or a preference)', () => {
  assert.equal(usesDeviceKeyboard({ search: '?keyboard=screen', kioskFlag: null }), false)
  assert.equal(usesDeviceKeyboard({ search: '?kiosk=1&keyboard=device', kioskFlag: null }), true)
  assert.equal(usesDeviceKeyboard({ search: '', kioskFlag: null, forced: 'screen' }), false)
})
