import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildGroceryPredictionDeferredUntil,
  normalizeGroceryNameKey,
  resolveGroceryPredictionDueAt,
  sanitizeGroceryPredictionDeferrals,
} from '../src/utils/groceryPredictionDeferrals.ts'

test('normalizeGroceryNameKey normalizes case and whitespace', () => {
  assert.equal(normalizeGroceryNameKey('  Vegetable   Oil  '), 'vegetable oil')
})

test('sanitizeGroceryPredictionDeferrals keeps only valid, unexpired entries', () => {
  const nowMs = Date.parse('2026-07-08T16:00:00.000Z')
  const parsed = sanitizeGroceryPredictionDeferrals({
    'Vegetable Oil': {
      name: 'Vegetable Oil',
      deferred_until: '2026-07-22T16:00:00.000Z',
      updated_at: '2026-07-08T16:00:00.000Z',
    },
    mustard: {
      name: 'mustard',
      deferred_until: '2026-07-01T16:00:00.000Z',
    },
    bad: {
      deferred_until: 'not-a-date',
    },
  }, nowMs)

  assert.deepEqual(Object.keys(parsed), ['vegetable oil'])
  assert.equal(parsed['vegetable oil']?.name, 'Vegetable Oil')
})

test('buildGroceryPredictionDeferredUntil extends from existing future deferral', () => {
  const nowMs = Date.parse('2026-07-08T16:00:00.000Z')
  const deferred = buildGroceryPredictionDeferredUntil('2026-07-22T16:00:00.000Z', nowMs, 3)
  assert.equal(deferred, '2026-07-25T16:00:00.000Z')
})

test('resolveGroceryPredictionDueAt applies deferred due date when later', () => {
  const nowMs = Date.parse('2026-07-08T16:00:00.000Z')
  const resolved = resolveGroceryPredictionDueAt(
    'Mustard',
    Date.parse('2026-07-09T16:00:00.000Z'),
    {
      mustard: {
        name: 'Mustard',
        deferred_until: '2026-07-22T16:00:00.000Z',
        updated_at: '2026-07-08T16:00:00.000Z',
      },
    },
    nowMs,
  )

  assert.equal(resolved.dueAt, Date.parse('2026-07-22T16:00:00.000Z'))
  assert.equal(resolved.deferredActive, true)
})
