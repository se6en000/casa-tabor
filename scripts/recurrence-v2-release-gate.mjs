import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { RECURRENCE_V2_REGRESSION_MATRIX } from './recurrence-v2-regression-matrix.mjs'

const liveFixtures = process.argv.includes('--live-fixtures')
const steps = [
  ['Unit and contract tests', 'npm', ['test']],
  ['TypeScript and production build', 'npm', ['run', 'build']],
]

if (liveFixtures) {
  steps.push(
    ['Scoped mutation database fixture', 'node', ['scripts/recurrence-v2-command-integration.mjs', '--live-fixture']],
    ['Materializer database fixture', 'node', ['scripts/recurrence-v2-materializer-integration.mjs', '--live-fixture']],
    ['Google projection fixture', 'node', ['scripts/google-recurrence-projection-integration.mjs', '--live-fixture']],
    ['Scoped AI recurrence fixture', 'node', ['scripts/recurrence-v2-ai-integration.mjs', '--live-fixture']],
  )
}

for (const row of RECURRENCE_V2_REGRESSION_MATRIX) {
  if (!existsSync(row.evidence)) throw new Error(`Missing recurrence regression evidence: ${row.evidence}`)
}

for (const [label, command, args] of steps) {
  console.log(`\n[recurrence-v2] ${label}`)
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log(JSON.stringify({
  success: true,
  matrix_areas: RECURRENCE_V2_REGRESSION_MATRIX.length,
  live_fixtures: liveFixtures,
}))
