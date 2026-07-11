import assert from 'node:assert/strict'
import test from 'node:test'
import { VISUAL_MATRIX } from '../visual-regression/matrix.mjs'

test('visual matrix covers required viewport, theme, and density contracts', () => {
  assert.equal(VISUAL_MATRIX.length, 6)
  assert.deepEqual(new Set(VISUAL_MATRIX.map(({ theme }) => theme)), new Set(['day', 'midnight']))
  assert.deepEqual(new Set(VISUAL_MATRIX.map(({ density }) => density)), new Set(['compact', 'touch', 'kiosk']))

  for (const theme of ['day', 'midnight']) {
    assert.ok(VISUAL_MATRIX.some(({ name }) => name === `mobile-${theme}-touch`))
    assert.ok(VISUAL_MATRIX.some(({ name }) => name === `desktop-${theme}-compact`))
    assert.ok(VISUAL_MATRIX.some(({ name }) => name === `kiosk-${theme}-kiosk`))
  }

  const kioskProfiles = VISUAL_MATRIX.filter(({ density }) => density === 'kiosk')
  assert.ok(kioskProfiles.every(({ viewport }) => viewport.width === 2560 && viewport.height === 1440))
})

test('every visual profile has a unique, valid contract', () => {
  assert.equal(new Set(VISUAL_MATRIX.map(({ name }) => name)).size, VISUAL_MATRIX.length)

  for (const profile of VISUAL_MATRIX) {
    assert.ok(profile.viewport.width > 0)
    assert.ok(profile.viewport.height > 0)
    assert.equal(profile.hasTouch, profile.density !== 'compact')
    assert.equal(profile.isMobile, profile.name.startsWith('mobile-'))
  }
})
