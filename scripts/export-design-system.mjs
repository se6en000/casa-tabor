#!/usr/bin/env node

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  DEFAULT_FONT_SCALE,
  DEFAULT_THEME_COLORS,
  DESIGN_TOKENS,
  MAX_FONT_SCALE,
  MIDNIGHT_THEME_COLORS,
  MIN_FONT_SCALE,
  THEME_COLOR_KEYS,
} from '../src/design-system/tokens.mjs'
import {
  COMPONENT_MANIFEST,
  DESIGN_SYSTEM_RELEASE_DATE,
  DESIGN_SYSTEM_SCHEMA_VERSION,
  DESIGN_SYSTEM_VERSION,
  renderComponentGuide,
  renderDesignSystemChangelog,
} from '../src/design-system/documentation.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputFlagIndex = process.argv.indexOf('--output')
const outputPath = resolve(
  repoRoot,
  outputFlagIndex >= 0 && process.argv[outputFlagIndex + 1]
    ? process.argv[outputFlagIndex + 1]
    : 'dist/casa-tabor-design-system.zip',
)
const tempRoot = mkdtempSync(resolve(tmpdir(), 'casa-design-system-'))
const bundleName = 'casa-tabor-design-system'
const bundleRoot = resolve(tempRoot, bundleName)

const copy = (source, destination = source) => {
  const target = resolve(bundleRoot, destination)
  mkdirSync(dirname(target), { recursive: true })
  cpSync(resolve(repoRoot, source), target, { recursive: true })
}

const guide = `# Casa Tabor Design System

Version ${DESIGN_SYSTEM_VERSION} (${DESIGN_SYSTEM_RELEASE_DATE})

This bundle is the implementation and usage source of truth for generating Casa Tabor UX.

## Required generation rules

- Use only the supplied tokens and shared components.
- Do not invent colors, type sizes, spacing, radii, shadows, or controls.
- Design touch-first with the supplied compact, touch, and kiosk density modes.
- Preserve minimum targets: 44px for compact/touch and 48px for kiosk.
- Use Cormorant Garamond for display/heading roles and DM Sans for body roles.
- Use semantic roles rather than arbitrary font sizes.
- Use shared Button, IconButton, Card, Chip, fields, selection controls, overlays, and feedback components.
- Assemble pages from the supplied headers, sections, rail, master-detail, feedback, and workflow patterns.
- Do not rely on hover, color alone, or tiny icon-only affordances.
- Provide responsive mobile, desktop, and 2560x1440 kiosk layouts.
- For the Home desktop shell, use 20% left rail, 55% center, and 25% right rail.

## Bundle map

- tokens.json: machine-readable themes, typography, controls, spacing, layout, motion, and elevation
- version.json: design-system and manifest schema versions
- component-manifest.json: machine-readable purpose, anti-pattern, variant, state, accessibility, responsive, and example contracts
- COMPONENT-GUIDE.md: human-readable documentation and copyable example for every public component
- CHANGELOG.md: versioned design-system history
- design-tokens.css: generated CSS variables for all density modes
- design-system/: canonical token and variant source
- components/ui/: canonical React components and their props
- DesignSystemGalleryPage.tsx: live component examples and supported states
- examples/: current Home, Settings, Grocery, and Cook implementations
- design-system.instructions.md: mandatory UX implementation rules
- index.css: application-level theme integration

## Prompt starter

Use the attached Casa Tabor design system as a strict source of truth. Reuse its
semantic tokens and existing components without inventing replacements. Produce
responsive mobile, desktop, and 2560x1440 kiosk UX. Explain which supplied
components and semantic roles each part uses. Check component-manifest.json for
required states, accessibility behavior, anti-patterns, and responsive rules
before generating a component.
`

try {
  mkdirSync(bundleRoot, { recursive: true })
  writeFileSync(resolve(bundleRoot, 'README.md'), guide)
  writeFileSync(resolve(bundleRoot, 'version.json'), `${JSON.stringify({
    version: DESIGN_SYSTEM_VERSION,
    releaseDate: DESIGN_SYSTEM_RELEASE_DATE,
    manifestSchemaVersion: DESIGN_SYSTEM_SCHEMA_VERSION,
  }, null, 2)}\n`)
  writeFileSync(resolve(bundleRoot, 'component-manifest.json'), `${JSON.stringify({
    schemaVersion: DESIGN_SYSTEM_SCHEMA_VERSION,
    designSystemVersion: DESIGN_SYSTEM_VERSION,
    components: COMPONENT_MANIFEST,
  }, null, 2)}\n`)
  writeFileSync(resolve(bundleRoot, 'COMPONENT-GUIDE.md'), renderComponentGuide())
  writeFileSync(resolve(bundleRoot, 'CHANGELOG.md'), renderDesignSystemChangelog())
  writeFileSync(resolve(bundleRoot, 'tokens.json'), `${JSON.stringify({
    designSystemVersion: DESIGN_SYSTEM_VERSION,
    themeColorKeys: THEME_COLOR_KEYS,
    themes: {
      default: DEFAULT_THEME_COLORS,
      midnight: MIDNIGHT_THEME_COLORS,
    },
    fontScale: {
      default: DEFAULT_FONT_SCALE,
      min: MIN_FONT_SCALE,
      max: MAX_FONT_SCALE,
    },
    tokens: DESIGN_TOKENS,
  }, null, 2)}\n`)

  copy('src/generated/design-tokens.css', 'design-tokens.css')
  copy('src/design-system', 'design-system')
  copy('src/components/ui', 'components/ui')
  copy('src/pages/DesignSystemGalleryPage.tsx', 'DesignSystemGalleryPage.tsx')
  copy('src/pages/HomePage.tsx', 'examples/HomePage.tsx')
  copy('src/components/settings/SettingsShell.tsx', 'examples/SettingsShell.tsx')
  copy('src/pages/GroceryPage.tsx', 'examples/GroceryPage.tsx')
  copy('src/pages/CookPage.tsx', 'examples/CookPage.tsx')
  copy('src/index.css', 'index.css')
  copy('.github/instructions/design-system.instructions.md', 'design-system.instructions.md')

  mkdirSync(dirname(outputPath), { recursive: true })
  rmSync(outputPath, { force: true })
  const zip = spawnSync('zip', ['-qr', outputPath, bundleName], {
    cwd: tempRoot,
    stdio: 'inherit',
  })
  if (zip.error) throw zip.error
  if (zip.status !== 0) throw new Error(`zip exited with status ${zip.status}`)
  console.log(`Created ${outputPath}`)
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
