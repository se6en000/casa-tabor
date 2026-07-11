import test from 'node:test'
import assert from 'node:assert/strict'

import { casaTwMerge } from '../src/utils/tailwindMerge.mjs'

test('semantic text size and color utilities coexist', () => {
  assert.equal(
    casaTwMerge('font-display text-display-xl', 'text-casa-navy truncate'),
    'font-display text-display-xl text-casa-navy truncate',
  )
  assert.equal(
    casaTwMerge('text-body-sm', 'text-casa-muted'),
    'text-body-sm text-casa-muted',
  )
})

test('later semantic text sizes still replace earlier sizes', () => {
  assert.equal(
    casaTwMerge('text-display-xl text-body'),
    'text-body',
  )
})

test('later semantic text colors still replace earlier colors', () => {
  assert.equal(
    casaTwMerge('text-casa-muted text-casa-navy'),
    'text-casa-navy',
  )
})

test('percentage rail basis survives shared class merging', () => {
  const classes = casaTwMerge(
    'hidden basis-5/16 min-w-0 shrink-0 lg:flex',
    'flex-col border-l',
  )

  assert.match(classes, /\bbasis-5\/16\b/)
  assert.match(classes, /\bshrink-0\b/)
})
