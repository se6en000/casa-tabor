#!/usr/bin/env node
// Casa Tabor style-debt audit (Phase 0 design-system standardization).
//
// Scans application source (src/**/*.ts,*.tsx) for a small set of REGRESSION
// GUARDRAIL heuristics — arbitrary fixed font sizes, raw hex colors, arbitrary
// z-index utilities, inline style blocks, and undersized square controls.
//
// This is intentionally NOT a linter and does not claim full precision/recall.
// See scripts/lib/audit-rules.mjs CATEGORIES[].heuristicLimits for exactly what
// each heuristic can and cannot see.
//
// Usage:
//   node scripts/style-audit.mjs                 print counts (human readable)
//   node scripts/style-audit.mjs --json           also write reports/style-audit.report.json
//   node scripts/style-audit.mjs --check          fail (exit 1) only if any tracked
//                                                 category count REGRESSES above the
//                                                 committed baseline (scripts/style-baseline.json)
//   node scripts/style-audit.mjs --update-baseline  rewrite the committed baseline to
//                                                    the current (presumably improved) counts
//
// No new dependencies: uses only Node's fs/path/url built-ins.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATEGORIES } from './lib/audit-rules.mjs'
import { computeRows, findRegressions } from './lib/guardrail.mjs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const SRC_DIR = join(REPO_ROOT, 'src')
const BASELINE_PATH = join(__dirname, 'style-baseline.json')
const REPORT_DIR = join(REPO_ROOT, 'reports')
const REPORT_PATH = join(REPORT_DIR, 'style-audit.report.json')

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx'])
const EXCLUDE_SUFFIXES = ['.d.ts', '.d.mts']
// Directories we intentionally never scan for style debt (build output/tests
// live outside src/ already, but keep this explicit for anyone who moves src/).
const EXCLUDE_DIR_NAMES = new Set(['node_modules', 'dist', '.git'])

/** Deterministically collect every *.ts/*.tsx file under `dir` (sorted). */
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
    if (EXCLUDE_DIR_NAMES.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full))
      continue
    }
    if (!entry.isFile()) continue
    const ext = entry.name.slice(entry.name.lastIndexOf('.'))
    if (!SCAN_EXTENSIONS.has(ext)) continue
    if (EXCLUDE_SUFFIXES.some((suf) => entry.name.endsWith(suf))) continue
    out.push(full)
  }
  return out
}

function runAudit() {
  const files = collectSourceFiles(SRC_DIR)
  /** @type {Record<string, { count: number, byFile: Record<string, {line:number, snippet:string}[]> }>} */
  const results = {}
  for (const cat of CATEGORIES) results[cat.id] = { count: 0, byFile: {} }

  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    const relPath = relative(REPO_ROOT, file)
    for (const cat of CATEGORIES) {
      const matches = cat.run(content)
      if (matches.length === 0) continue
      results[cat.id].count += matches.length
      results[cat.id].byFile[relPath] = matches
    }
  }

  return { filesScanned: files.length, results }
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return null
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
}

function writeBaseline(audit) {
  const baseline = {
    version: 1,
    description:
      'Committed style-debt budget for Casa Tabor Phase 0 guardrail. ' +
      'style:check fails only when a category count exceeds these numbers — ' +
      'reducing debt below baseline is always allowed and encouraged; update ' +
      'this file downward with `npm run style:audit -- --update-baseline` ' +
      'once debt is intentionally reduced.',
    generatedFrom: 'current committed src/ at time of generation (deterministic regex scan)',
    filesScanned: audit.filesScanned,
    categories: Object.fromEntries(
      CATEGORIES.map((cat) => [cat.id, audit.results[cat.id].count]),
    ),
  }
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n')
  return baseline
}

function printReport(audit, baseline) {
  console.log(`\nCasa Tabor style-debt audit — ${audit.filesScanned} files scanned under src/**/*.{ts,tsx}\n`)
  const counts = Object.fromEntries(CATEGORIES.map((cat) => [cat.id, audit.results[cat.id].count]))
  const rows = computeRows(CATEGORIES, counts, baseline?.categories)
  const idWidth = Math.max(...rows.map((r) => r.id.length))
  for (const r of rows) {
    const baseStr = typeof r.base === 'number' ? `baseline ${r.base}` : 'no baseline'
    const deltaStr =
      r.delta === null ? '' : r.delta > 0 ? `  (+${r.delta} REGRESSION)` : r.delta < 0 ? `  (${r.delta} improved)` : '  (no change)'
    console.log(`  ${r.id.padEnd(idWidth)}  ${String(r.count).padStart(4)}   ${baseStr}${deltaStr}`)
  }
  console.log('\nHeuristic limits (read before treating counts as precise):')
  for (const cat of CATEGORIES) {
    console.log(`  - ${cat.label}: ${cat.heuristicLimits}`)
  }
  console.log('')
  return rows
}

function main() {
  const args = process.argv.slice(2)
  const wantsJson = args.includes('--json')
  const wantsCheck = args.includes('--check')
  const wantsUpdateBaseline = args.includes('--update-baseline')

  const audit = runAudit()
  const baseline = loadBaseline()
  const rows = printReport(audit, baseline)

  if (wantsJson) {
    mkdirSync(REPORT_DIR, { recursive: true })
    writeFileSync(
      REPORT_PATH,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          filesScanned: audit.filesScanned,
          categories: Object.fromEntries(rows.map((r) => [r.id, { count: r.count, baseline: r.base, delta: r.delta }])),
          details: Object.fromEntries(CATEGORIES.map((cat) => [cat.id, audit.results[cat.id].byFile])),
        },
        null,
        2,
      ) + '\n',
    )
    console.log(`Wrote JSON report to ${relative(REPO_ROOT, REPORT_PATH)} (git-ignored, not committed)\n`)
  }

  if (wantsUpdateBaseline) {
    const written = writeBaseline(audit)
    console.log(`Updated baseline at ${relative(REPO_ROOT, BASELINE_PATH)}:`)
    console.log(JSON.stringify(written.categories, null, 2))
    return
  }

  if (wantsCheck) {
    if (!baseline) {
      console.error('No committed baseline found at scripts/style-baseline.json — run with --update-baseline first.')
      process.exitCode = 1
      return
    }
    const regressions = findRegressions(rows)
    if (regressions.length > 0) {
      console.error('style:check FAILED — the following categories regressed above the committed baseline:')
      for (const r of regressions) {
        console.error(`  - ${r.label}: ${r.count} (baseline ${r.base}, +${r.delta})`)
      }
      console.error('\nFix the new occurrences, or if intentional/unavoidable, run:')
      console.error('  npm run style:audit -- --update-baseline\nand commit the updated scripts/style-baseline.json with justification in the PR.\n')
      process.exitCode = 1
      return
    }
    console.log('style:check PASSED — no tracked category regressed above baseline.\n')
  }
}

main()
