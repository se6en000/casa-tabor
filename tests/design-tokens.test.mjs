import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_THEME_COLORS,
  DESIGN_TOKENS,
  MIDNIGHT_THEME_COLORS,
  THEME_COLOR_KEYS,
} from '../src/design-system/tokens.mjs'
import { resolveDensityProfile } from '../src/lib/densityProfile.mjs'

test('day and midnight palettes implement the same complete color contract', () => {
  assert.deepEqual(Object.keys(DEFAULT_THEME_COLORS), THEME_COLOR_KEYS)
  assert.deepEqual(Object.keys(MIDNIGHT_THEME_COLORS), THEME_COLOR_KEYS)
})

test('every design-system category has a non-empty semantic token set', () => {
  for (const category of ['fontFamily', 'type', 'spacing', 'layout', 'container', 'controls', 'radius', 'shadow', 'motion', 'zIndex']) {
    assert.ok(Object.keys(DESIGN_TOKENS[category]).length > 0, `${category} must define tokens`)
  }
})

test('responsive layout tokens define explicit phone, tablet, and wide tiers', () => {
  assert.equal(DESIGN_TOKENS.layout.breakpointTablet, '48rem')
  assert.equal(DESIGN_TOKENS.layout.breakpointWide, '80rem')
  assert.equal(DESIGN_TOKENS.layout.gutterPhone, '1rem')
  assert.equal(DESIGN_TOKENS.layout.gutterTablet, '1.5rem')
  assert.equal(DESIGN_TOKENS.layout.gutterWide, '2rem')
  assert.equal(DESIGN_TOKENS.container['page-narrow'], '48rem')
  assert.equal(DESIGN_TOKENS.container.page, '80rem')
  assert.equal(DESIGN_TOKENS.container['page-wide'], '96rem')
})

test('semantic type roles define compact, touch, kiosk, and line-height values', () => {
  for (const [role, token] of Object.entries(DESIGN_TOKENS.type)) {
    assert.ok(token.compact, `${role} needs compact sizing`)
    assert.ok(token.touch, `${role} needs touch sizing`)
    assert.ok(token.kiosk, `${role} needs kiosk sizing`)
    assert.ok(token.lineHeight, `${role} needs a line height`)
  }
})

test('semantic supporting text remains distance-readable in every density', () => {
  const minimums = { compact: 14, touch: 14, kiosk: 18 }
  for (const density of ['compact', 'touch', 'kiosk']) {
    for (const role of ['caption', 'body-sm', 'body', 'body-lg']) {
      const minimumDeclaredSize = Number.parseFloat(DESIGN_TOKENS.type[role][density].match(/\d+(?:\.\d+)?/)?.[0] ?? '0')
      assert.ok(
        minimumDeclaredSize >= minimums[density],
        `${role} must remain readable in ${density} density`,
      )
    }
  }
})

test('control targets meet 44px handheld and 48px kiosk minimums', () => {
  assert.equal(DESIGN_TOKENS.controls.compact.target, '44px')
  assert.equal(DESIGN_TOKENS.controls.touch.target, '44px')
  assert.equal(DESIGN_TOKENS.controls.kiosk.target, '48px')
})

test('fine pointer uses compact density regardless of viewport width', () => {
  assert.equal(resolveDensityProfile({ width: 1920, coarsePointer: false, touchPoints: 0 }), 'compact')
})

test('touch devices use touch density below the kiosk breakpoint', () => {
  assert.equal(resolveDensityProfile({ width: 390, coarsePointer: true }), 'touch')
  assert.equal(resolveDensityProfile({ width: 1024, coarsePointer: false, touchPoints: 5 }), 'touch')
})

test('wide touch devices use kiosk density', () => {
  assert.equal(resolveDensityProfile({ width: 1280, coarsePointer: true }), 'kiosk')
  assert.equal(resolveDensityProfile({ width: 1920, coarsePointer: false, touchPoints: 10 }), 'kiosk')
})

test('an explicit kiosk profile survives viewport scaling below the automatic breakpoint', () => {
  assert.equal(resolveDensityProfile({
    width: 1138,
    coarsePointer: true,
    forcedProfile: 'kiosk',
  }), 'kiosk')
})

test('invalid explicit profiles cannot bypass capability detection', () => {
  assert.equal(resolveDensityProfile({
    width: 390,
    coarsePointer: true,
    forcedProfile: 'oversized',
  }), 'touch')
})
