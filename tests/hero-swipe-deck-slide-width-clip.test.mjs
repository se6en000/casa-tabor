import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-24: the Hero card's right edge was visibly hard-clipped (no ellipsis,
// no wrap -- text just cut off mid-word), reported live right after the scroll-
// rail change. Confirmed via a live DOM measurement against production, NOT a
// side effect of that change: the swipe deck's current slide (`shrink-0 grow-0
// basis-full`, no min-w-0) was rendering ~1400px wide inside its 1182px
// overflow-hidden viewport. Flex items default to min-width:auto, so a long
// unwrapped descendant (ImminentTransitWidget's location line, rendered as a
// single-line flex row with no min-w-0 on its text span) forced the slide wider
// than its own basis-full, and the swipe deck's overflow-hidden then hard-
// clipped the overflow instead of the text wrapping inside it.
const heroSrc = readFileSync(new URL('../src/components/canvas/CalmKioskView.tsx', import.meta.url), 'utf8')
const transitSrc = readFileSync(new URL('../src/components/canvas/widgets/ImminentTransitWidget.tsx', import.meta.url), 'utf8')

test('every swipe deck slide wrapper has min-w-0 so it cannot be forced wider than the viewport', () => {
  const wrapperMatches = [...heroSrc.matchAll(/className="shrink-0 grow-0 basis-full[^"]*"/g)]
  assert.ok(wrapperMatches.length >= 2, 'expected to find both the primary slide wrapper and the flyby slide wrapper')
  for (const m of wrapperMatches) {
    assert.match(m[0], /min-w-0/, `slide wrapper missing min-w-0: ${m[0]}`)
  }
})

test('ImminentTransitWidget location row constrains its text so it can wrap instead of overflowing', () => {
  const locationBlock = transitSrc.slice(
    transitSrc.indexOf('locationDisplayText &&'),
    transitSrc.indexOf('locationDisplayText &&') + 400,
  )
  assert.match(locationBlock, /min-w-0/, 'the location row (or its text span) should have min-w-0')
})
