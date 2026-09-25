import test from 'node:test'
import assert from 'node:assert/strict'
import { fitLabels } from '../src/wall/labelFit.ts'

const LIMIT = 1528
const label = (key, x, width, maxWidth = null) => ({ key, x, width, maxWidth })

test('a label that fits starts at its block', () => {
  assert.deepEqual(fitLabels([label('workout', 1278, 150)], LIMIT), { workout: { left: 1278, maxWidth: 250 } })
})

test('a label that would run off the stage moves left just enough to end at the edge', () => {
  assert.deepEqual(fitLabels([label('costume', 1458, 300)], LIMIT), { costume: { left: 1228, maxWidth: 300 } })
})

test('it never moves into the label before it; it stops there and is cut instead', () => {
  const fit = fitLabels([label('coach', 1323, 260, 119), label('costume', 1458, 300)], LIMIT)
  assert.deepEqual(fit.coach, { left: 1323, maxWidth: 119 })
  assert.deepEqual(fit.costume, { left: 1458, maxWidth: 70 })
})

test('it never moves left of where a shorter label would sit anyway', () => {
  const fit = fitLabels([label('a', 100, 80, 200), label('late', 1400, 200)], LIMIT)
  assert.equal(fit.late.left, 1328)
})

test('a label held short by the next label is left where it is', () => {
  const fit = fitLabels([label('first', 1300, 400, 150), label('second', 1466, 40)], LIMIT)
  assert.deepEqual(fit.first, { left: 1300, maxWidth: 150 })
})
