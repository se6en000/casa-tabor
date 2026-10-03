import test from 'node:test'
import assert from 'node:assert/strict'
import { fullHeight, keyboardHeight, SWIPE_CLOSE_PX } from '../src/phone/phoneShell.ts'

// The phone as an app, pass 1: the keyboard's height comes from the visual viewport; a toolbar's few points aren't one.
test('keyboard: the height under the visual viewport, nothing for a toolbar or no viewport', () => {
  assert.equal(keyboardHeight(844, { height: 508, offsetTop: 0 }), 336)
  assert.equal(keyboardHeight(844, { height: 790, offsetTop: 0 }), 0)
  assert.equal(keyboardHeight(844, { height: 508, offsetTop: 20 }), 316)
  assert.equal(keyboardHeight(844, null), 0)
})

// Jake's phone, Oct 2, after a reload: a gap with nothing being typed shrank the frame and the bar floated.
test('keyboard: no field being typed in, no keyboard — whatever the viewport says', () => {
  assert.equal(keyboardHeight(844, { height: 700, offsetTop: 0 }, false), 0)
  assert.equal(keyboardHeight(844, { height: 508, offsetTop: 0 }, true), 336)
})

test('a sheet closes when it’s dragged down far enough to mean it', () => {
  assert.ok(SWIPE_CLOSE_PX >= 60 && SWIPE_CLOSE_PX <= 140)
})

// Jake's iPhone, Oct 2 (phone_keyboard, 430x932, home screen): typing in Ask Casa, the keyboard took the visual viewport
// from 873 to 460; 24 ms later iOS also shrank the window to 460 and scrolled the page 413 up. Measured against the
// window's height of that moment the keyboard read 0, the frame went back to full height and the box sat behind the
// keyboard for the whole message. The keyboard is measured against the window's full height from before typing.
test('keyboard: measured against the full height from before typing, not the window iOS shrinks mid-animation', () => {
  let full = fullHeight(0, 873, false)
  assert.equal(full, 873)
  full = fullHeight(full, 460, true) // iOS shrinks the window while the keyboard comes up
  assert.equal(full, 873)
  assert.equal(keyboardHeight(full, { height: 460, offsetTop: 0 }), 413)
  full = fullHeight(full, 873, true)
  assert.equal(keyboardHeight(full, { height: 460, offsetTop: 0 }), 413)
  // Nothing typed: the window's own height again (a turn to landscape).
  assert.equal(fullHeight(full, 400, false), 400)
})

// Jake, Oct 2: "I need to be able to iOS paste into chat. I can't today." The page turns the long-press menu off; the
// text boxes turn it back on, or iPhone never offers Paste.
import { readFileSync } from 'node:fs'
test('text boxes keep iPhone’s long-press menu (Paste)', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  const rule = css.slice(css.indexOf('html.phone-app input,'), css.indexOf('}', css.indexOf('html.phone-app input,')))
  assert.match(rule, /-webkit-touch-callout:\s*default/)
})
