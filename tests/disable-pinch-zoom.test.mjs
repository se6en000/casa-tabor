import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { initDisablePinchZoom } from '../src/lib/disablePinchZoom.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

test('index.html disables user scaling and zoom in viewport meta tag', () => {
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8')
  assert.match(indexHtml, /name=["']viewport["']/)
  assert.match(indexHtml, /user-scalable=no/)
  assert.match(indexHtml, /maximum-scale=1\.0/)
})

test('src/index.css sets touch-action: pan-x pan-y to prevent zoom gestures', () => {
  const indexCss = fs.readFileSync(path.join(rootDir, 'src/index.css'), 'utf-8')
  assert.match(indexCss, /touch-action:\s*pan-x\s+pan-y;/)
})

test('initDisablePinchZoom attaches and cleans up gesture prevention handlers', () => {
  const listeners = new Map()

  const fakeDocument = {
    addEventListener(event, handler, options) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push({ handler, options })
    },
    removeEventListener(event, handler) {
      if (!listeners.has(event)) return
      const list = listeners.get(event).filter((item) => item.handler !== handler)
      listeners.set(event, list)
    },
  }

  // Run in mock global scope
  const originalDoc = globalThis.document
  const originalWin = globalThis.window

  try {
    globalThis.document = fakeDocument
    globalThis.window = {}

    const cleanup = initDisablePinchZoom()

    // Verify all necessary listeners are attached. No `touchmove` listener --
    // a non-passive one here would force every touch-scroll gesture app-wide
    // onto the slow, main-thread-gated path (root-caused 2026-09-13); pinch
    // itself is already blocked declaratively by the touch-action CSS rule
    // asserted below.
    assert.ok(listeners.get('gesturestart')?.length, 'gesturestart listener attached')
    assert.ok(listeners.get('gesturechange')?.length, 'gesturechange listener attached')
    assert.ok(listeners.get('gestureend')?.length, 'gestureend listener attached')
    assert.ok(!listeners.get('touchmove')?.length, 'no touchmove listener attached')
    assert.ok(listeners.get('wheel')?.length, 'wheel listener attached')

    // Test gesturestart preventDefault
    let gesturePrevented = false
    const gestureEvent = { preventDefault() { gesturePrevented = true } }
    listeners.get('gesturestart')[0].handler(gestureEvent)
    assert.equal(gesturePrevented, true, 'gesturestart calls preventDefault')

    // Test Ctrl + wheel zoom (trackpad pinch)
    let ctrlWheelPrevented = false
    const ctrlWheelEvent = {
      ctrlKey: true,
      preventDefault() { ctrlWheelPrevented = true },
    }
    listeners.get('wheel')[0].handler(ctrlWheelEvent)
    assert.equal(ctrlWheelPrevented, true, 'ctrl+wheel calls preventDefault')

    // Test ordinary wheel does not preventDefault
    let normalWheelPrevented = false
    const normalWheelEvent = {
      ctrlKey: false,
      preventDefault() { normalWheelPrevented = true },
    }
    listeners.get('wheel')[0].handler(normalWheelEvent)
    assert.equal(normalWheelPrevented, false, 'normal wheel does not preventDefault')

    // Test cleanup
    cleanup()
    assert.equal(listeners.get('gesturestart').length, 0)
    assert.equal(listeners.get('gesturechange').length, 0)
    assert.equal(listeners.get('gestureend').length, 0)
    assert.equal(listeners.get('wheel').length, 0)
  } finally {
    globalThis.document = originalDoc
    globalThis.window = originalWin
  }
})
