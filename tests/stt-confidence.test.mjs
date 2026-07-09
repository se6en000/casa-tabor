import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConfidence } from '../src/lib/sttConfidence.mjs'

test('stt-confidence: null for non-number / non-finite input', () => {
  assert.equal(normalizeConfidence(undefined), null)
  assert.equal(normalizeConfidence(null), null)
  assert.equal(normalizeConfidence('0.9'), null)
  assert.equal(normalizeConfidence(NaN), null)
  assert.equal(normalizeConfidence(Infinity), null)
})

test('stt-confidence: 0..1 fractional values pass through clamped', () => {
  assert.equal(normalizeConfidence(0), 0)
  assert.equal(normalizeConfidence(0.5), 0.5)
  assert.equal(normalizeConfidence(1), 1)
})

test('stt-confidence: percentage values (1,100] are divided by 100', () => {
  assert.equal(normalizeConfidence(90), 0.9)
  assert.equal(normalizeConfidence(75), 0.75)
  assert.equal(normalizeConfidence(100), 1)
})

test('stt-confidence: out-of-range values clamp to [0,1]', () => {
  assert.equal(normalizeConfidence(-5), 0)
  assert.equal(normalizeConfidence(150), 1)
})

test('stt-confidence: boundary just above 1 is treated as a percentage', () => {
  // 1.5 is > 1 and <= 100 → percentage → 0.015
  assert.equal(normalizeConfidence(1.5), 0.015)
})
