import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const bounceScroll = readFileSync(new URL('../src/components/shared/BounceScroll.tsx', import.meta.url), 'utf8')
const aiDrawer = readFileSync(new URL('../src/components/shared/AIChatDrawer.tsx', import.meta.url), 'utf8')

test('bounce scroll traps touch overscroll inside drawer content on mobile', () => {
  assert.match(bounceScroll, /addEventListener\('touchmove', onTouchMove, \{ passive: false \}\)/)
  assert.match(bounceScroll, /if \(event\.cancelable\) event\.preventDefault\(\)/)
  assert.match(bounceScroll, /event\.stopPropagation\(\)/)
  assert.match(bounceScroll, /cannotScroll \|\| \(delta > 0 && atTop\) \|\| \(delta < 0 && atBottom\)/)
  assert.match(bounceScroll, /data-ptr-ignore/)
  assert.match(bounceScroll, /touch-pan-y/)
  assert.match(bounceScroll, /overscrollBehaviorY: 'none'/)
})

test('AI drawer locks the background application scroll while open', () => {
  assert.match(aiDrawer, /root\.style\.overflow = 'hidden'/)
  assert.match(aiDrawer, /body\.style\.overflow = 'hidden'/)
  assert.match(aiDrawer, /appMain\.style\.touchAction = 'none'/)
  assert.match(aiDrawer, /root\.style\.overflow = previous\.rootOverflow/)
  assert.match(aiDrawer, /appMain\.style\.touchAction = previous\.appMainTouchAction/)
})

test('AI conversation uses native mobile scrolling without the bounce transform layer', () => {
  assert.match(aiDrawer, /<BounceScroll nativeScroll className="flex-1 min-h-0"/)
  assert.match(bounceScroll, /if \(nativeScroll\) \{/)
  assert.match(bounceScroll, /data-native-scroll/)
  assert.match(bounceScroll, /min-h-0 overflow-y-auto overscroll-none touch-pan-y/)
})
