import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-24: live diagnostic test, not a permanent design decision. User
// reported the homepage was still jaggy on scroll after the shadow/blur
// removal (see hero-swipe-deck-slide-width-clip / the pi-ux-lag-investigation
// memory) -- and, crucially, that the sidecar's own scroll is smooth despite
// having all its shadows/UX chrome intact. That comparison points away from
// shadows (again -- the 2026-09-13 CDP investigation already ruled them out)
// and toward something the sidecar doesn't have: HeroSwipeDeck's Framer
// Motion `drag="x"`, live on this surface any time there's more than one
// slide (nearly always in practice). A live gesture listener's mere presence
// is a known cause of browsers falling off the compositor-thread scroll fast
// path, independent of any per-event JS cost -- consistent with the prior
// investigation's "~91% idle but still janky" profile. This test just
// confirms the diagnostic flag exists and is actually wired to the `drag`
// prop; it does not (and cannot, from a unit test) confirm whether disabling
// it actually fixes the kiosk's feel -- that's the physical test.
const src = readFileSync(new URL('../src/components/canvas/CalmKioskView.tsx', import.meta.url), 'utf8')

test('HeroSwipeDeck has a DIAGNOSTIC_DISABLE_HERO_DRAG flag, currently forcing drag off', () => {
  assert.match(src, /const DIAGNOSTIC_DISABLE_HERO_DRAG = true/)
})

test('the drag prop actually respects the diagnostic flag', () => {
  assert.match(
    src,
    /drag=\{DIAGNOSTIC_DISABLE_HERO_DRAG \? false : multi && viewportWidth > 0 \? 'x' : false\}/,
  )
})
