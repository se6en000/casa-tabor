import test from 'node:test'
import assert from 'node:assert/strict'
import { wallLedMode, isLedNight } from '../src/wall/led.ts'

// The LED strip follows the assistant band (P3.14): gold by day, dim amber at night, and a
// faint candle glow at night while nobody's talking to Casa — unless it's switched off.

const at = (h) => new Date(2026, 8, 26, h, 0)

test('night is the wall\'s evening: 7 PM to 6 AM', () => {
  assert.equal(isLedNight(at(18)), false)
  assert.equal(isLedNight(at(19)), true)
  assert.equal(isLedNight(at(2)), true)
  assert.equal(isLedNight(at(6)), false)
})

test('the band says what the strip shows', () => {
  const open = { bandOpen: true, micOpen: false, night: false, glowEnabled: true }
  assert.equal(wallLedMode({ ...open, bandState: 'LISTENING', micOpen: true }), 'listening')
  assert.equal(wallLedMode({ ...open, bandState: 'THINKING' }), 'processing')
  assert.equal(wallLedMode({ ...open, bandState: 'NEEDS A YES', micOpen: true }), 'waiting')
  assert.equal(wallLedMode({ ...open, bandState: 'ANSWERED', micOpen: true }), 'listening', 'the mic stays open after an answer')
  assert.equal(wallLedMode({ ...open, bandState: 'ANSWERED' }), 'off', 'by day, nothing when the mic has closed')
})

test('idle at night: a candle glow, unless switched off in Settings; by day, off', () => {
  assert.equal(wallLedMode({ bandOpen: false, bandState: null, micOpen: false, night: true, glowEnabled: true }), 'glow')
  assert.equal(wallLedMode({ bandOpen: false, bandState: null, micOpen: false, night: true, glowEnabled: false }), 'off')
  assert.equal(wallLedMode({ bandOpen: false, bandState: null, micOpen: false, night: false, glowEnabled: true }), 'off')
  assert.equal(wallLedMode({ bandOpen: true, bandState: 'ANSWERED', micOpen: false, night: true, glowEnabled: true }), 'glow')
})
