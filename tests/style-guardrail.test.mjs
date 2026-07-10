import test from 'node:test'
import assert from 'node:assert/strict'

import { computeRows, findRegressions } from '../scripts/lib/guardrail.mjs'

const CATS = [
  { id: 'a', label: 'Category A' },
  { id: 'b', label: 'Category B' },
  { id: 'c', label: 'Category C (new, no baseline yet)' },
]

test('computeRows reports no delta when a category has no baseline', () => {
  const rows = computeRows(CATS, { a: 5, b: 2, c: 9 }, { a: 5, b: 2 })
  const c = rows.find((r) => r.id === 'c')
  assert.equal(c.base, undefined)
  assert.equal(c.delta, null)
})

test('computeRows reports zero delta when count matches baseline exactly', () => {
  const rows = computeRows(CATS, { a: 5, b: 2, c: 0 }, { a: 5, b: 2 })
  const a = rows.find((r) => r.id === 'a')
  assert.equal(a.delta, 0)
})

test('computeRows reports negative delta on improvement (debt reduced)', () => {
  const rows = computeRows(CATS, { a: 3, b: 2, c: 0 }, { a: 5, b: 2 })
  const a = rows.find((r) => r.id === 'a')
  assert.equal(a.delta, -2)
})

test('findRegressions ignores categories at/below baseline (the guardrail must not fail on existing debt)', () => {
  const rows = computeRows(CATS, { a: 5, b: 1, c: 0 }, { a: 5, b: 2 })
  const regressions = findRegressions(rows)
  assert.equal(regressions.length, 0)
})

test('findRegressions flags only categories that increased beyond baseline', () => {
  const rows = computeRows(CATS, { a: 6, b: 2, c: 100 }, { a: 5, b: 2 })
  const regressions = findRegressions(rows)
  assert.equal(regressions.length, 1)
  assert.equal(regressions[0].id, 'a')
  assert.equal(regressions[0].delta, 1)
})

test('findRegressions never flags a category with no committed baseline, no matter how high the count', () => {
  const rows = computeRows(CATS, { a: 5, b: 2, c: 999999 }, { a: 5, b: 2 })
  const regressions = findRegressions(rows)
  assert.equal(regressions.length, 0)
})

test('end-to-end: identical counts to baseline never regress (idempotent baseline)', () => {
  const baseline = { a: 10, b: 20 }
  const rows = computeRows(CATS, { a: 10, b: 20, c: 0 }, baseline)
  assert.equal(findRegressions(rows).length, 0)
})
