#!/usr/bin/env node

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { COMPONENT_MANIFEST } from '../src/design-system/documentation.mjs'
import { DESIGN_TOKENS } from '../src/design-system/tokens.mjs'
import { APPEARANCE_PRESETS } from '../src/design-system/themes.mjs'
import { VISUAL_MATRIX } from '../visual-regression/matrix.mjs'
import { runAudit } from './style-audit.mjs'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const PRODUCT_ROOTS = [join(REPO_ROOT, 'src/pages'), join(REPO_ROOT, 'src/components')]
const REPORT_PATH = join(REPO_ROOT, 'reports/experience-certification.report.json')
const EXCLUDED_SURFACES = new Set([
  'src/pages/DesignSystemGalleryPage.tsx',
  'src/pages/VisualRegressionPage.tsx',
])
const SPECIALIZED_NATIVE_SURFACES = new Set([
  'src/components/shared/TouchKeyboard.tsx',
])
const SPECIALIZED_NATIVE_BUTTONS = new Set([
  'src/components/calendar/EventDetailPanel.tsx',
  'src/components/calendar/WeekView.tsx',
])
const NATIVE_CONTROL_TAGS = new Set(['button', 'input', 'select', 'textarea'])
const NON_PRIMITIVE_INPUT_TYPES = new Set(['color', 'file', 'range'])
const SHARED_PRIMITIVES = new Set(COMPONENT_MANIFEST.map(({ name }) => name))

function collectProductFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (path.endsWith('/components/ui')) continue
      files.push(...collectProductFiles(path))
    } else if (entry.isFile() && extname(path) === '.tsx') {
      const relativePath = relative(REPO_ROOT, path)
      if (!EXCLUDED_SURFACES.has(relativePath)) files.push(path)
    }
  }
  return files
}

function jsxTagName(node, sourceFile) {
  return node.tagName.getText(sourceFile)
}

function inputType(node, sourceFile) {
  if (jsxTagName(node, sourceFile) !== 'input') return null
  const typeAttribute = node.attributes.properties.find(
    (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === 'type',
  )
  if (!typeAttribute?.initializer || !ts.isStringLiteral(typeAttribute.initializer)) return 'text'
  return typeAttribute.initializer.text
}

export function measurePrimitiveAdoption() {
  let sharedPrimitiveInstances = 0
  let eligibleNativeControls = 0
  let excludedSpecializedControls = 0
  const byFile = {}

  for (const filePath of PRODUCT_ROOTS.flatMap(collectProductFiles)) {
    const relativePath = relative(REPO_ROOT, filePath)
    const sourceFile = ts.createSourceFile(
      filePath,
      readFileSync(filePath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    let shared = 0
    let native = 0
    let excluded = 0

    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tagName = jsxTagName(node, sourceFile)
        if (SHARED_PRIMITIVES.has(tagName)) shared += 1
        if (NATIVE_CONTROL_TAGS.has(tagName)) {
          const type = inputType(node, sourceFile)
          const specialized = SPECIALIZED_NATIVE_SURFACES.has(relativePath)
            || (tagName === 'button' && SPECIALIZED_NATIVE_BUTTONS.has(relativePath))
            || (type !== null && NON_PRIMITIVE_INPUT_TYPES.has(type))
          if (specialized) excluded += 1
          else native += 1
        }
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
    sharedPrimitiveInstances += shared
    eligibleNativeControls += native
    excludedSpecializedControls += excluded
    if (shared > 0 || native > 0 || excluded > 0) {
      byFile[relativePath] = { shared, eligibleNative: native, excludedSpecialized: excluded }
    }
  }

  const eligibleInstances = sharedPrimitiveInstances + eligibleNativeControls
  return {
    sharedPrimitiveInstances,
    eligibleNativeControls,
    excludedSpecializedControls,
    adoptionRate: eligibleInstances === 0 ? 0 : sharedPrimitiveInstances / eligibleInstances,
    byFile,
  }
}

export function buildCertification() {
  const styleAudit = runAudit()
  const adoption = measurePrimitiveAdoption()
  const actionableDebt = Object.fromEntries(
    Object.entries(styleAudit.results).map(([id, result]) => [id, result.count]),
  )
  const visualProfiles = new Set(VISUAL_MATRIX.map(({ name }) => name))
  const requiredProfiles = [
    'mobile-day-touch',
    'mobile-midnight-touch',
    'desktop-day-compact',
    'desktop-midnight-compact',
    'kiosk-day-kiosk',
    'kiosk-midnight-kiosk',
  ]
  const gates = {
    sharedPrimitiveAdoption: adoption.adoptionRate >= 0.9,
    zeroArbitraryLayers: actionableDebt.arbitraryZIndex === 0,
    zeroTitleOnlyLabels: actionableDebt.titleOnlyButtonLabels === 0,
    zeroRawUiColors: actionableDebt.rawHexColors === 0,
    fewerThanTenArbitraryTypeSizes: actionableDebt.arbitraryFontSize < 10,
    zeroUndersizedControls: actionableDebt.undersizedSquareControls === 0,
    zeroHoverOnlyReveals: actionableDebt.hoverOnlyReveals === 0,
    completeVisualMatrix: requiredProfiles.every((profile) => visualProfiles.has(profile)),
    distanceReadableKioskType: Number.parseFloat(DESIGN_TOKENS.type.caption.kiosk) >= 18,
    completeThemeContracts: APPEARANCE_PRESETS.length >= 7,
  }

  return {
    generatedAt: new Date().toISOString(),
    passed: Object.values(gates).every(Boolean),
    gates,
    metrics: {
      adoption: {
        ...adoption,
        adoptionPercent: Number((adoption.adoptionRate * 100).toFixed(2)),
      },
      actionableDebt,
      visualProfileCount: VISUAL_MATRIX.length,
      appearancePresetCount: APPEARANCE_PRESETS.length,
      minimumKioskTextPx: Number.parseFloat(DESIGN_TOKENS.type.caption.kiosk),
    },
  }
}

function main() {
  const certification = buildCertification()
  mkdirSync(join(REPO_ROOT, 'reports'), { recursive: true })
  writeFileSync(REPORT_PATH, `${JSON.stringify(certification, null, 2)}\n`)

  console.log('\nCasa Tabor experience certification\n')
  for (const [gate, passed] of Object.entries(certification.gates)) {
    console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${gate}`)
  }
  console.log(`\n  Shared primitive adoption: ${certification.metrics.adoption.adoptionPercent}%`)
  console.log(`  Visual profiles: ${certification.metrics.visualProfileCount}`)
  console.log(`  Appearance presets: ${certification.metrics.appearancePresetCount}`)
  console.log(`  Minimum kiosk supporting text: ${certification.metrics.minimumKioskTextPx}px`)
  console.log(`\nWrote ${relative(REPO_ROOT, REPORT_PATH)}\n`)

  if (!certification.passed) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main()
}
