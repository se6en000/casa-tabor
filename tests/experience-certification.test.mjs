import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCertification, measurePrimitiveAdoption } from '../scripts/experience-certification.mjs'

test('active product surfaces meet the shared primitive adoption gate', () => {
  const adoption = measurePrimitiveAdoption()
  assert.ok(
    adoption.adoptionRate >= 0.9,
    `shared primitive adoption must stay at or above 90%; received ${(adoption.adoptionRate * 100).toFixed(2)}%`,
  )
  assert.ok(adoption.sharedPrimitiveInstances > 0)
})

test('the complete 9/10 experience certification remains green', () => {
  const certification = buildCertification()
  assert.equal(certification.passed, true)
  assert.deepEqual(
    Object.entries(certification.gates).filter(([, passed]) => !passed),
    [],
  )
})
