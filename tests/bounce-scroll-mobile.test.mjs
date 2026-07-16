import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const bounceScroll = readFileSync(new URL('../src/components/shared/BounceScroll.tsx', import.meta.url), 'utf8')

test('bounce scroll traps touch overscroll inside drawer content on mobile', () => {
  assert.match(bounceScroll, /if \(e\.cancelable\) e\.preventDefault\(\)/)
  assert.match(bounceScroll, /e\.stopPropagation\(\)/)
  assert.match(bounceScroll, /data-ptr-ignore/)
  assert.match(bounceScroll, /touch-pan-y/)
})
