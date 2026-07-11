import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  COMPONENT_MANIFEST,
  DESIGN_SYSTEM_RELEASE_DATE,
  DESIGN_SYSTEM_SCHEMA_VERSION,
  DESIGN_SYSTEM_VERSION,
  renderComponentGuide,
  renderDesignSystemChangelog,
} from '../src/design-system/documentation.mjs'

function publicUiExports() {
  const source = readFileSync(resolve('src/components/ui/index.ts'), 'utf8')
  const names = []
  for (const match of source.matchAll(/export\s*\{([\s\S]*?)\}\s*from/g)) {
    for (const part of match[1].split(',')) {
      const exportName = part.trim()
      if (exportName && !exportName.startsWith('type ')) {
        names.push(exportName.split(/\s+/)[0])
      }
    }
  }
  return names.sort()
}

test('component manifest documents every public UI component exactly once', () => {
  const documented = COMPONENT_MANIFEST.map((entry) => entry.name).sort()
  assert.deepEqual(documented, publicUiExports())
  assert.equal(new Set(documented).size, documented.length)
})

test('every component documents the complete Phase 4 usage contract', () => {
  for (const entry of COMPONENT_MANIFEST) {
    assert.ok(entry.category, `${entry.name} needs a category`)
    assert.ok(entry.purpose, `${entry.name} needs a purpose`)
    assert.ok(entry.useWhen, `${entry.name} needs use guidance`)
    assert.ok(entry.avoid, `${entry.name} needs an anti-pattern`)
    assert.ok(entry.variants.length > 0, `${entry.name} needs variants`)
    assert.ok(entry.states.length > 0, `${entry.name} needs states`)
    assert.ok(entry.accessibility, `${entry.name} needs accessibility guidance`)
    assert.ok(entry.responsive, `${entry.name} needs responsive guidance`)
    assert.match(entry.example, new RegExp(`<${entry.name}\\b`), `${entry.name} needs a copyable example`)
  }
})

test('component guide renders every manifest entry with copyable TSX', () => {
  const guide = renderComponentGuide()
  for (const entry of COMPONENT_MANIFEST) {
    assert.match(guide, new RegExp(`## ${entry.name}\\n`))
    assert.match(guide, new RegExp(entry.example.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(guide, /```tsx/)
})

test('design-system version and changelog metadata are publishable', () => {
  assert.match(DESIGN_SYSTEM_VERSION, /^\d+\.\d+\.\d+$/)
  assert.match(DESIGN_SYSTEM_RELEASE_DATE, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(DESIGN_SYSTEM_SCHEMA_VERSION, 1)
  assert.match(renderDesignSystemChangelog(), new RegExp(`## ${DESIGN_SYSTEM_VERSION} - ${DESIGN_SYSTEM_RELEASE_DATE}`))
})

test('portable export includes version, manifest, guide, and changelog artifacts', () => {
  const source = readFileSync(resolve('scripts/export-design-system.mjs'), 'utf8')
  for (const artifact of ['version.json', 'component-manifest.json', 'COMPONENT-GUIDE.md', 'CHANGELOG.md']) {
    assert.match(source, new RegExp(artifact.replace('.', '\\.')))
  }
  assert.match(source, /designSystemVersion: DESIGN_SYSTEM_VERSION/)
  assert.match(source, /examples\/SettingsShell\.tsx/)
})
