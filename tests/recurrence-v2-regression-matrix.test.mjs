import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { RECURRENCE_V2_REGRESSION_MATRIX } from '../scripts/recurrence-v2-regression-matrix.mjs'

const gate = readFileSync('scripts/recurrence-v2-release-gate.mjs', 'utf8')
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

test('recurrence matrix covers every release-critical layer', () => {
  const areas = new Set(RECURRENCE_V2_REGRESSION_MATRIX.map((row) => row.area))
  for (const area of [
    'generation',
    'scoped mutations',
    'detail fidelity',
    'deletion and recovery',
    'materialization',
    'Google contract',
    'responsive UX',
    'operations',
  ]) {
    assert.ok(areas.has(area), `Missing ${area} recurrence coverage`)
  }
})

test('scope and detail matrices include Outlook-grade variations', () => {
  const cases = RECURRENCE_V2_REGRESSION_MATRIX.flatMap((row) => row.cases)
  for (const required of [
    'this',
    'future split',
    'all',
    'exception preservation',
    'transportation',
    'checklists',
    'actions',
    'this delete',
    'future delete',
    'all delete',
    '30-day Undo',
  ]) {
    assert.ok(cases.includes(required), `Missing ${required} regression case`)
  }
})

test('release gate runs automated tests, production build, and reversible live fixtures', () => {
  assert.match(gate, /\['Unit and contract tests', 'npm', \['test'\]\]/)
  assert.match(gate, /\['TypeScript and production build', 'npm', \['run', 'build'\]\]/)
  assert.match(gate, /recurrence-v2-command-integration\.mjs/)
  assert.match(gate, /recurrence-v2-materializer-integration\.mjs/)
  assert.match(gate, /google-recurrence-projection-integration\.mjs/)
  assert.match(gate, /if \(result\.status !== 0\) process\.exit/)
  assert.equal(packageJson.scripts['qa:recurrence-v2'], 'node scripts/recurrence-v2-release-gate.mjs')
})
