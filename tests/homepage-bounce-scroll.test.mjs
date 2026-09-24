import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-24: user directly compared the homepage's right rail against the
// sidecar's scroll feel throughout this whole investigation -- "even with
// its bounce effect" the sidecar felt smoother. That bounce turned out to be
// a real, custom, reusable component (BounceScroll, src/components/shared/
// BounceScroll.tsx) already used by 9+ other surfaces (EventEditSheet,
// AIChatDrawer, NotificationDrawer, etc.) as an iOS-style rubber-band
// replacement for plain overflow-y-auto -- not native browser overscroll.
// This wires the same component into the homepage's right rail (desktop/
// kiosk only) once asked for directly.
const bounceSrc = readFileSync(new URL('../src/components/shared/BounceScroll.tsx', import.meta.url), 'utf8')
const kioskSrc = readFileSync(new URL('../src/components/canvas/CalmKioskView.tsx', import.meta.url), 'utf8')

test('BounceScroll accepts an external innerRef and onScroll without disturbing its own internal ref', () => {
  assert.match(bounceSrc, /innerRef\?: React\.Ref<HTMLDivElement>/)
  assert.match(bounceSrc, /onScroll\?: React\.UIEventHandler<HTMLDivElement>/)
  assert.match(bounceSrc, /const setScrollRef = useCallback/)
  // Both render branches (native and custom-bounce) must forward it.
  const refUsages = [...bounceSrc.matchAll(/ref=\{setScrollRef\}/g)]
  assert.equal(refUsages.length, 2, 'expected setScrollRef wired to both the nativeScroll and bounce render branches')
})

test('the homepage right rail uses BounceScroll at desktop/kiosk widths', () => {
  assert.match(kioskSrc, /import BounceScroll from '\.\.\/shared\/BounceScroll'/)
  assert.match(kioskSrc, /isDesktop \? \(\s*<BounceScroll/)
  assert.match(kioskSrc, /innerRef=\{scheduleRailRef\}/)
  assert.match(kioskSrc, /onScroll=\{handleScheduleRailScroll\}/)
})

test('mobile still gets a plain, non-bounce wrapper -- BounceScroll would break its native page scroll there', () => {
  assert.match(kioskSrc, /import \{ useMediaQuery \} from '\.\.\/\.\.\/hooks\/useMediaQuery'/)
  assert.match(kioskSrc, /const isDesktop = useMediaQuery\('\(min-width: 1024px\)'\)/)
  assert.match(kioskSrc, /<div className="flex flex-col gap-8">\{scheduleRailItems\}<\/div>/)
})

test('scheduleRailItems is defined once and reused by both branches, not duplicated', () => {
  assert.match(kioskSrc, /const scheduleRailItems = \(/)
  const usages = [...kioskSrc.matchAll(/\{scheduleRailItems\}/g)]
  assert.equal(usages.length, 2, 'expected exactly 2 usages: inside BounceScroll and inside the mobile fallback div')
})
