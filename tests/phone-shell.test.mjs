import test from 'node:test'
import assert from 'node:assert/strict'
import { keyboardHeight, SWIPE_CLOSE_PX } from '../src/phone/phoneShell.ts'

// The phone as an app, pass 1: the keyboard's height comes from the visual viewport; a toolbar's few points aren't one.
test('keyboard: the height under the visual viewport, nothing for a toolbar or no viewport', () => {
  assert.equal(keyboardHeight(844, { height: 508, offsetTop: 0 }), 336)
  assert.equal(keyboardHeight(844, { height: 790, offsetTop: 0 }), 0)
  assert.equal(keyboardHeight(844, { height: 508, offsetTop: 20 }), 316)
  assert.equal(keyboardHeight(844, null), 0)
})

test('a sheet closes when it’s dragged down far enough to mean it', () => {
  assert.ok(SWIPE_CLOSE_PX >= 60 && SWIPE_CLOSE_PX <= 140)
})
