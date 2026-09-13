import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { initTouchDeviceFlag } from '../src/lib/touchDeviceFlag.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

function withFakeDom(maxTouchPoints, fn) {
  const attrs = new Map()
  const fakeDocument = {
    documentElement: {
      setAttribute: (name, value) => attrs.set(name, value),
      getAttribute: (name) => attrs.get(name),
    },
  }
  const originalDoc = globalThis.document
  const originalNavDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  try {
    globalThis.document = fakeDocument
    Object.defineProperty(globalThis, 'navigator', { value: { maxTouchPoints }, configurable: true })
    fn(attrs)
  } finally {
    globalThis.document = originalDoc
    Object.defineProperty(globalThis, 'navigator', originalNavDescriptor)
  }
}

test('initTouchDeviceFlag marks html[data-touch-device] when the device reports real touch points', () => {
  withFakeDom(10, (attrs) => {
    initTouchDeviceFlag()
    assert.equal(attrs.get('data-touch-device'), 'true')
  })
})

test('initTouchDeviceFlag does not mark html when the device has no touch points', () => {
  withFakeDom(0, (attrs) => {
    initTouchDeviceFlag()
    assert.equal(attrs.has('data-touch-device'), false)
  })
})

test('src/index.css gates the hover variant on html[data-touch-device], not only @media (hover: hover)', () => {
  // @media (hover: hover) alone isn't reliable everywhere: the kiosk's
  // Chromium-on-X11 setup reports (hover: hover) as true for its
  // touchscreen (root-caused 2026-09-13), which silently defeated the
  // original touch-first hover suppression. navigator.maxTouchPoints,
  // surfaced here via html[data-touch-device], isn't fooled the same way.
  const indexCss = fs.readFileSync(path.join(rootDir, 'src/index.css'), 'utf-8')
  assert.match(indexCss, /@custom-variant hover \(&:hover:not\(html\[data-touch-device\] \*\)\);/)
})

test('src/main.tsx wires up initTouchDeviceFlag at startup', () => {
  const mainTsx = fs.readFileSync(path.join(rootDir, 'src/main.tsx'), 'utf-8')
  assert.match(mainTsx, /initTouchDeviceFlag\(\)/)
})
