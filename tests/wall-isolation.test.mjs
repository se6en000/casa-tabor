import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

// Import-boundary guardrail: the Family Wall must never depend on the old
// homepage, so the old code can be deleted without breaking the Wall.
const FORBIDDEN = [
  /components\/canvas\//,
  /heroFocus/,
  /useHeroIntelligence/,
  /useCalmKioskPresenter/,
  /pointerGestures/,
  /SidecarCompanion/,
]

function listSourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return listSourceFiles(full)
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
  })
}

test('src/wall imports nothing from the old homepage', () => {
  const root = process.cwd()
  const violations = []
  for (const file of listSourceFiles(join(root, 'src/wall'))) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
      if (FORBIDDEN.some((pattern) => pattern.test(match[1]))) {
        violations.push(`${relative(root, file)} -> ${match[1]}`)
      }
    }
  }
  assert.deepEqual(violations, [])
})
