import test from 'node:test'
import assert from 'node:assert/strict'
import { qrModules, qrPath } from '../src/wall/qr.ts'

// Directions on the wall (canvas 13c, approved 2026-09-30): a QR code of the Google Maps route.
test('a QR code: square, with the three corner squares a phone looks for', () => {
  const m = qrModules('https://www.google.com/maps/dir/?api=1&destination=8255%20West%20Lake%20Drive%2C%20Lake%20Clark%20Shores%2C%20FL%2033406')
  const n = m.length
  assert.ok(n >= 21 && m.every((row) => row.length === n))
  for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    assert.ok(m[r][c] && m[r + 6][c + 6] && m[r + 3][c + 3], 'the finder square is there')
    assert.equal(m[r + 1][c + 1], false, 'with its light ring')
  }
  assert.match(qrPath(m), /^M0 0h1v1h-1z/)
  assert.notDeepEqual(qrModules('tel:+15615550101'), m, 'a different text, a different code')
})
