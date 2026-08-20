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

    // Verify all necessary listeners are attached
    assert.ok(listeners.get('gesturestart')?.length, 'gesturestart listener attached')
    assert.ok(listeners.get('gesturechange')?.length, 'gesturechange listener attached')
    assert.ok(listeners.get('gestureend')?.length, 'gestureend listener attached')
    assert.ok(listeners.get('touchmove')?.length, 'touchmove listener attached')
    assert.ok(listeners.get('wheel')?.length, 'wheel listener attached')

    // Test gesturestart preventDefault
    let gesturePrevented = false
    const gestureEvent = { preventDefault() { gesturePrevented = true } }
    listeners.get('gesturestart')[0].handler(gestureEvent)
    assert.equal(gesturePrevented, true, 'gesturestart calls preventDefault')

    // Test touchmove with multi-touch (pinch)
    let multiTouchPrevented = false
    const multiTouchEvent = {
      touches: [{ clientX: 10 }, { clientX: 20 }],
      preventDefault() { multiTouchPrevented = true },
    }
    listeners.get('touchmove')[0].handler(multiTouchEvent)
    assert.equal(multiTouchPrevented, true, 'multi-touch touchmove calls preventDefault')

    // Test single-touch touchmove does not preventDefault
    let singleTouchPrevented = false
    const singleTouchEvent = {
      touches: [{ clientX: 10 }],
      preventDefault() { singleTouchPrevented = true },
    }
    listeners.get('touchmove')[0].handler(singleTouchEvent)
    assert.equal(singleTouchPrevented, false, 'single touch does not preventDefault')

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
    assert.equal(listeners.get('touchmove').length, 0)
    assert.equal(listeners.get('wheel').length, 0)
  } finally {
    globalThis.document = originalDoc
    globalThis.window = originalWin
  }
})
