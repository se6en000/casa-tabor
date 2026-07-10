import test from 'node:test'
import assert from 'node:assert/strict'

import { DEVICE_MATRIX, closestDeviceProfile, exactDeviceMatch } from '../src/lib/deviceMatrix.mjs'

test('DEVICE_MATRIX encodes the seven required viewport/input profiles', () => {
  assert.equal(DEVICE_MATRIX.length, 7) // 3 phone widths + tablet portrait/landscape + Pi kiosk + desktop
  const dims = DEVICE_MATRIX.map((d) => `${d.width}x${d.height}:${d.input}`)
  assert.ok(dims.includes('375x667:touch'))
  assert.ok(dims.includes('390x844:touch'))
  assert.ok(dims.includes('428x926:touch'))
  assert.ok(dims.includes('768x1024:touch'))
  assert.ok(dims.includes('1024x768:touch'))
  assert.ok(dims.includes('1920x1080:touch'))
  assert.ok(dims.includes('1440x900:fine-pointer'))
})

test('every profile has at least one acceptance check', () => {
  for (const d of DEVICE_MATRIX) {
    assert.ok(Array.isArray(d.acceptance) && d.acceptance.length > 0, `${d.id} must define acceptance checks`)
  }
})

test('exactDeviceMatch finds an exact width/height hit', () => {
  const match = exactDeviceMatch(1920, 1080)
  assert.equal(match?.id, 'pi-kiosk')
})

test('exactDeviceMatch matches rotated dimensions (tablet portrait <-> landscape)', () => {
  // 1024x768 is itself the landscape profile; but portrait rotated (1024 wide,768 tall)
  // should still resolve to the landscape entry via the width/height swap check.
  const match = exactDeviceMatch(1024, 768)
  assert.equal(match?.id, 'tablet-landscape')
})

test('exactDeviceMatch returns null for dimensions outside the matrix', () => {
  assert.equal(exactDeviceMatch(1234, 5678), null)
})

test('closestDeviceProfile snaps an arbitrary phone size to the nearest known profile', () => {
  const match = closestDeviceProfile(393, 852, 'touch') // Pixel-ish size close to 390x844
  assert.equal(match.id, 'phone-390')
})

test('closestDeviceProfile respects the input filter (does not cross touch/fine-pointer)', () => {
  // Dimensions close to the Pi kiosk (1920x1080, touch) but requesting fine-pointer
  // should NOT return the Pi profile — it should fall back to the nearest fine-pointer entry.
  const match = closestDeviceProfile(1900, 1060, 'fine-pointer')
  assert.equal(match.input, 'fine-pointer')
  assert.equal(match.id, 'desktop-fine-pointer')
})

test('closestDeviceProfile is deterministic for identical inputs', () => {
  const a = closestDeviceProfile(1024, 768)
  const b = closestDeviceProfile(1024, 768)
  assert.equal(a.id, b.id)
})
