#!/usr/bin/env node
// ============================================================================
// Casa Tabor — Comprehensive Design System Coverage & Migration Audit
// ============================================================================
// Scans every page (src/pages/*.tsx) and component (src/components/**/*.tsx)
// across Casa Tabor to evaluate design system compliance:
// 1. Shared UI Primitive usage (Button, IconButton, Chip, Card, Field, etc.)
// 2. Elimination of raw native controls (<button>, unstyled <input>, <select>)
// 3. Elimination of raw hex colors (#hex), arbitrary font sizes (text-[Npx]),
//    arbitrary z-indices (z-[N]), and undersized touch controls (<44px).
// 4. Generates an actionable Todo List & Migration Roadmap in Markdown.
//
// Usage:
//   node scripts/design-system-coverage-audit.mjs
//   node scripts/design-system-coverage-audit.mjs --json
//   node scripts/design-system-coverage-audit.mjs --markdown
// ============================================================================

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPONENT_MANIFEST } from '../src/design-system/documentation.mjs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const SRC_DIR = join(REPO_ROOT, 'src')
const REPORT_DIR = join(REPO_ROOT, 'reports')
const REPORT_MD_PATH = join(REPORT_DIR, 'design-system-migration-todo.md')
const REPORT_JSON_PATH = join(REPORT_DIR, 'design-system-coverage.report.json')

const SHARED_PRIMITIVES = new Set([
  ...COMPONENT_MANIFEST.map((c) => c.name),
  'PrimaryRail',
  'SecondaryRail',
  'ContentSection',
  'ThreeRailLayout',
  'MasterDetailLayout',
  'WorkflowActions',
  'PageFeedback',
  'PageHeader',
  'SectionHeader',
  'ConfirmationDialog',
])

const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.git', 'generated'])
// We don't audit the primitives' own internal definition files as debt
const EXCLUDE_PATHS = new Set([
  'src/components/ui',
  'src/design-system',
])

function collectSourceFiles(dir) {
  const out = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    const rel = relative(REPO_ROOT, full)
    if (Array.from(EXCLUDE_PATHS).some((ex) => rel.startsWith(ex))) continue

    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full))
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      if (!entry.name.endsWith('.d.ts') && !entry.name.endsWith('.d.mts')) {
        out.push(full)
      }
    }
  }
  return out
}

function auditFile(filePath) {
  const content = readFileSync(filePath, 'utf8')
  const relPath = relative(REPO_ROOT, filePath)
  const lines = content.split(/\r\n|\r|\n/)

  const issues = []
  let sharedPrimitiveCount = 0
  let nativeButtonCount = 0
  let nativeInputCount = 0
  let rawHexColorCount = 0
  let arbitraryFontSizeCount = 0
  let arbitraryZIndexCount = 0
  let undersizedControlCount = 0
  let inlineStyleCount = 0

  // Count shared primitive occurrences
  for (const prim of SHARED_PRIMITIVES) {
    const regex = new RegExp(`<${prim}\\b`, 'g')
    const matches = content.match(regex)
    if (matches) sharedPrimitiveCount += matches.length
  }

  // Scan line by line
  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1
    const trimmed = lineText.trim()

    // Skip pure comment lines
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return

    // 1. Raw <button> tags (lowercase native HTML tag, NOT <Button>)
    if (/<button\b/.test(lineText) && !lineText.includes('// exempt')) {
      nativeButtonCount++
      issues.push({
        line: lineNum,
        type: 'native-button',
        severity: 'high',
        message: 'Raw <button> used. Migrate to <Button>, <IconButton>, or <Chip>.',
        snippet: trimmed,
      })
    }

    // 2. Raw unstyled <input>, <select>, <textarea> (lowercase native HTML tags, NOT <Input>, <Select>, etc)
    if (/<(input|select|textarea)\b/.test(lineText) && !lineText.includes('// exempt')) {
      // Inspect surrounding lines for multiline tag attributes
      const tagChunk = lines.slice(idx, Math.min(lines.length, idx + 8)).join(' ')
      // Ignore hidden or specialized range/file/color inputs
      if (!/type=["'](?:hidden|color|file|range)["']/i.test(tagChunk)) {
        nativeInputCount++
        issues.push({
          line: lineNum,
          type: 'native-form-control',
          severity: 'medium',
          message: 'Raw native form control. Wrap with <Field> or use <Input>/<Select>/<Combobox>.',
          snippet: trimmed,
        })
      }
    }

    // 3. Raw hex colors
    const hexMatches = lineText.match(/#(?:[0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3,4})\b/g)
    if (hexMatches && !lineText.includes('// exempt') && !relPath.includes('memberColors')) {
      rawHexColorCount += hexMatches.length
      issues.push({
        line: lineNum,
        type: 'raw-hex-color',
        severity: 'high',
        message: `Hardcoded hex color (${hexMatches.join(', ')}). Use Tailwind semantic color tokens.`,
        snippet: trimmed,
      })
    }

    // 4. Arbitrary font sizes (text-[13px] etc)
    const fontMatches = lineText.match(/\btext-\[\d+(?:\.\d+)?(?:px|rem|em)\]/g)
    if (fontMatches) {
      arbitraryFontSizeCount += fontMatches.length
      issues.push({
        line: lineNum,
        type: 'arbitrary-font-size',
        severity: 'medium',
        message: `Arbitrary font size (${fontMatches.join(', ')}). Use semantic roles (text-body-sm, text-heading, etc).`,
        snippet: trimmed,
      })
    }

    // 5. Arbitrary z-index (z-[60] etc)
    const zMatches = lineText.match(/\bz-\[\d+\]/g)
    if (zMatches) {
      arbitraryZIndexCount += zMatches.length
      issues.push({
        line: lineNum,
        type: 'arbitrary-z-index',
        severity: 'high',
        message: `Arbitrary z-index (${zMatches.join(', ')}). Use semantic z-indices (z-popover, z-modal, z-toast).`,
        snippet: trimmed,
      })
    }

    // 6. Undersized controls (<44px square utilities)
    const undersizedMatch = lineText.match(/\b(?:w-[1-9]|w-10)\s+(?:h-[1-9]|h-10)\b|\bsize-([1-9]|10)\b/)
    if (undersizedMatch && /<button|<a\b/.test(lineText) && !lineText.includes('size-control')) {
      undersizedControlCount++
      issues.push({
        line: lineNum,
        type: 'undersized-control',
        severity: 'high',
        message: 'Sub-44px interactive control. Violates touch standard (min 44px mobile, 48px kiosk).',
        snippet: trimmed,
      })
    }

    // 7. Inline styles
    if (/\bstyle=\{\{/g.test(lineText) && !lineText.includes('// exempt')) {
      inlineStyleCount++
      issues.push({
        line: lineNum,
        type: 'inline-style',
        severity: 'low',
        message: 'Inline style object. Verify if token or utility class can replace it.',
        snippet: trimmed,
      })
    }
  })

  // Calculate compliance score (0-100)
  const totalViolations =
    nativeButtonCount * 3 +
    nativeInputCount * 2 +
    rawHexColorCount * 3 +
    arbitraryFontSizeCount * 2 +
    arbitraryZIndexCount * 3 +
    undersizedControlCount * 3 +
    inlineStyleCount * 0.5

  const baseWeight = Math.max(10, sharedPrimitiveCount * 2)
  const score = Math.max(0, Math.min(100, Math.round(100 - (totalViolations / (baseWeight + totalViolations)) * 100)))

  return {
    path: relPath,
    isPage: relPath.startsWith('src/pages/'),
    sharedPrimitiveCount,
    nativeButtonCount,
    nativeInputCount,
    rawHexColorCount,
    arbitraryFontSizeCount,
    arbitraryZIndexCount,
    undersizedControlCount,
    inlineStyleCount,
    totalIssueCount: issues.length,
    score,
    status: score === 100 ? 'certified' : score >= 80 ? 'minor-cleanup' : 'needs-migration',
    issues,
  }
}

export function runFullDesignSystemAudit() {
  const files = collectSourceFiles(SRC_DIR)
  const fileReports = files.map(auditFile)

  const pages = fileReports.filter((r) => r.isPage)
  const components = fileReports.filter((r) => !r.isPage)

  const totalFiles = fileReports.length
  const certifiedFiles = fileReports.filter((r) => r.status === 'certified').length
  const minorCleanupFiles = fileReports.filter((r) => r.status === 'minor-cleanup').length
  const needsMigrationFiles = fileReports.filter((r) => r.status === 'needs-migration').length

  const avgScore = Math.round(fileReports.reduce((acc, r) => acc + r.score, 0) / (totalFiles || 1))

  return {
    timestamp: new Date().toISOString(),
    summary: {
      totalFiles,
      avgScore,
      certifiedFiles,
      minorCleanupFiles,
      needsMigrationFiles,
      totalPages: pages.length,
      certifiedPages: pages.filter((p) => p.status === 'certified').length,
    },
    pages,
    components,
    allFiles: fileReports,
  }
}

function generateMarkdownTodo(auditData) {
  const { summary, pages, components } = auditData

  const needsWorkPages = pages.filter((p) => p.status !== 'certified')
  const needsWorkComponents = components.filter((c) => c.status !== 'certified' && c.totalIssueCount > 0)

  let md = `# Casa Tabor — Design System Migration Todo & Coverage Report\n\n`
  md += `> **Generated:** ${new Date().toLocaleString()}  \n`
  md += `> **Overall Design System Compliance Score:** **${summary.avgScore}%**  \n`
  md += `> **Status:** ${summary.certifiedPages}/${summary.totalPages} Pages 100% Certified (${summary.certifiedFiles}/${summary.totalFiles} Total Surfaces)\n\n`

  md += `## 📊 Executive Summary\n\n`
  md += `| Category | Total | 🟢 Certified (100%) | 🟡 Minor Cleanup (80-99%) | 🔴 Needs Migration (<80%) |\n`
  md += `| :--- | :--- | :--- | :--- | :--- |\n`
  md += `| **Pages (\`src/pages/\`)** | ${summary.totalPages} | ${pages.filter((p) => p.status === 'certified').length} | ${pages.filter((p) => p.status === 'minor-cleanup').length} | ${pages.filter((p) => p.status === 'needs-migration').length} |\n`
  md += `| **Components (\`src/components/\`)** | ${components.length} | ${components.filter((c) => c.status === 'certified').length} | ${components.filter((c) => c.status === 'minor-cleanup').length} | ${components.filter((c) => c.status === 'needs-migration').length} |\n`
  md += `| **All App Surfaces** | **${summary.totalFiles}** | **${summary.certifiedFiles}** | **${summary.minorCleanupFiles}** | **${summary.needsMigrationFiles}** |\n\n`

  md += `---\n\n`
  md += `## 🚀 Page Migration Todo List (Action Items)\n\n`

  if (needsWorkPages.length === 0) {
    md += `🎉 **All pages in \`src/pages/\` are 100% certified on the design system!**\n\n`
  } else {
    needsWorkPages
      .sort((a, b) => a.score - b.score)
      .forEach((page) => {
        const badge = page.score < 80 ? '🔴 NEEDS MIGRATION' : '🟡 MINOR CLEANUP'
        md += `### ${page.path} (${badge} · Score: ${page.score}%)\n\n`
        md += `- **Shared Primitives Used:** ${page.sharedPrimitiveCount}\n`
        md += `- **Issues Identified:** ${page.totalIssueCount} (${page.nativeButtonCount} raw buttons, ${page.rawHexColorCount} hex colors, ${page.arbitraryFontSizeCount} font size utils, ${page.undersizedControlCount} undersized targets)\n\n`
        md += `| Line | Issue Type | Severity | Snippet / Remediation |\n`
        md += `| :--- | :--- | :--- | :--- |\n`
        page.issues.slice(0, 10).forEach((issue) => {
          md += `| \`${issue.line}\` | \`${issue.type}\` | **${issue.severity.toUpperCase()}** | \`${issue.snippet.replace(/\|/g, '\\|')}\` |\n`
        })
        if (page.issues.length > 10) {
          md += `| ... | ... | ... | *+${page.issues.length - 10} more issues in file* |\n`
        }
        md += `\n`
      })
  }

  md += `---\n\n`
  md += `## 🧩 Component Migration Todo List\n\n`

  if (needsWorkComponents.length === 0) {
    md += `🎉 **All components are 100% compliant with shared primitives and design tokens!**\n\n`
  } else {
    needsWorkComponents
      .sort((a, b) => a.score - b.score)
      .slice(0, 20)
      .forEach((comp) => {
        const badge = comp.score < 80 ? '🔴 NEEDS MIGRATION' : '🟡 MINOR POLISH'
        md += `### ${comp.path} (${badge} · Score: ${comp.score}%)\n\n`
        md += `- **Issues:** ${comp.totalIssueCount} (${comp.nativeButtonCount} buttons, ${comp.rawHexColorCount} hex, ${comp.arbitraryFontSizeCount} font sizes)\n`
        comp.issues.slice(0, 5).forEach((issue) => {
          md += `  - Line ${issue.line} [${issue.type}]: \`${issue.snippet}\`\n`
        })
        md += `\n`
      })
  }

  md += `---\n\n`
  md += `## 🛡️ Mandatory Design System Deployment Gate\n\n`
  md += `To guarantee zero UX regressions and block unapproved UI from ever being deployed:\n`
  md += `1. **Deployment Gate:** \`scripts/deploy.sh\` runs \`npm run tokens:check && npm run style:check && npm run certify:experience && npm test\` before committing or publishing to Vercel.\n`
  md += `2. **Build Gate:** \`npm run build\` runs automated style check & experience certification.\n`
  md += `3. **Audit Gate:** \`node scripts/design-system-coverage-audit.mjs\` verifies primitive adoption rate across all files.\n`

  return md
}

function main() {
  const audit = runFullDesignSystemAudit()
  mkdirSync(REPORT_DIR, { recursive: true })

  writeFileSync(REPORT_JSON_PATH, `${JSON.stringify(audit, null, 2)}\n`)
  const md = generateMarkdownTodo(audit)
  writeFileSync(REPORT_MD_PATH, md)

  console.log(`\n=============================================================`)
  console.log(`🏛️  CASA TABOR — DESIGN SYSTEM COVERAGE AUDIT`)
  console.log(`=============================================================`)
  console.log(`Overall Compliance Score:  ${audit.summary.avgScore}%`)
  console.log(`Total Surfaces Scanned:    ${audit.summary.totalFiles}`)
  console.log(`🟢 Certified (100%):        ${audit.summary.certifiedFiles}`)
  console.log(`🟡 Minor Cleanup (80-99%):  ${audit.summary.minorCleanupFiles}`)
  console.log(`🔴 Needs Migration (<80%):  ${audit.summary.needsMigrationFiles}`)
  console.log(`-------------------------------------------------------------`)
  console.log(`Pages Status:              ${audit.summary.certifiedPages}/${audit.summary.totalPages} Pages Certified`)
  console.log(`Actionable Report Written: reports/design-system-migration-todo.md`)
  console.log(`=============================================================\n`)
}

main()
