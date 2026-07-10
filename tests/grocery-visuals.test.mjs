import test from 'node:test'
import assert from 'node:assert/strict'

import { GROCERY_CATEGORY_KEYS } from '../src/utils/groceryCategorization.ts'
import {
  CATEGORY_TONE,
  categoryIconBadgeClassName,
  getCategoryTone,
  getDepletionVisual,
  urgencyDotClassName,
  urgencyMeterClassName,
  urgencyTagClassName,
} from '../src/utils/groceryVisuals.ts'

test('every canonical grocery category resolves to a semantic tone', () => {
  for (const key of GROCERY_CATEGORY_KEYS) {
    const tone = getCategoryTone(key)
    assert.ok(CATEGORY_TONE[key], `category ${key} must have a mapped tone`)
    assert.equal(tone, CATEGORY_TONE[key])
  }
})

test('getCategoryTone defaults unknown categories to neutral', () => {
  assert.equal(getCategoryTone('not-a-real-category'), 'neutral')
})

test('categoryIconBadgeClassName never emits a raw hex literal', () => {
  const tones = new Set(Object.values(CATEGORY_TONE))
  for (const tone of tones) {
    const cls = categoryIconBadgeClassName(tone)
    assert.ok(cls.length > 0)
    assert.doesNotMatch(cls, /#[0-9A-Fa-f]{3,8}/)
    assert.match(cls, /\bbg-casa-/)
    assert.match(cls, /\btext-casa-/)
  }
})

test('categoryIconBadgeClassName falls back to neutral for an unrecognized tone', () => {
  // @ts-expect-error intentionally passing an invalid tone to verify the fallback
  assert.equal(categoryIconBadgeClassName('not-a-tone'), categoryIconBadgeClassName('neutral'))
})

test('getDepletionVisual buckets days-until into now/soon/later with a human label', () => {
  assert.deepEqual(getDepletionVisual(0), { dueLabel: 'Due now', tone: 'now' })
  assert.deepEqual(getDepletionVisual(-2), { dueLabel: 'Due now', tone: 'now' })
  assert.deepEqual(getDepletionVisual(1), { dueLabel: 'In 1 day', tone: 'soon' })
  assert.deepEqual(getDepletionVisual(3), { dueLabel: 'In 3 days', tone: 'soon' })
  assert.deepEqual(getDepletionVisual(4), { dueLabel: 'In 4 days', tone: 'later' })
  assert.deepEqual(getDepletionVisual(7), { dueLabel: 'In 7 days', tone: 'later' })
})

test('urgency class helpers are token-backed (no raw hex) for every tone getDepletionVisual can produce', () => {
  const tones = ['now', 'soon', 'later']
  for (const tone of tones) {
    for (const cls of [urgencyDotClassName(tone), urgencyMeterClassName(tone), urgencyTagClassName(tone)]) {
      assert.ok(cls.length > 0)
      assert.doesNotMatch(cls, /#[0-9A-Fa-f]{3,8}/)
      assert.match(cls, /casa-/)
    }
  }
})
