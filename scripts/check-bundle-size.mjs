#!/usr/bin/env node
// Bundle-size budget (item 8 of the 2026-09-23 app best-practices review).
//
// A concrete guard against the exact regression this session found and fixed:
// the main entry bundle had grown to 2.93MB with zero code-splitting (every
// page load downloaded the AI assistant, recipe importer, music player,
// every settings page...). Route-based code splitting brought it to ~2.08MB;
// this budget fails the build if it creeps back up, rather than relying on
// someone noticing Vite's own >500kB warning in build output.
//
// Checks the EAGER entry chunk specifically (Vite's default `index-*.js`
// naming for the main bundle -- lazy route chunks get their own distinct
// names, e.g. GroceryPage-*.js, and are correctly excluded: growing a lazy
// chunk doesn't cost anything until that route is actually visited).
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST_ASSETS_DIR = 'dist/assets'
// 2026-09-23 measured: 2081KB right after code-splitting. Budget gives
// headroom for real growth but catches a slide back toward the old 2930KB.
export const MAIN_BUNDLE_BUDGET_BYTES = 2.5 * 1024 * 1024

export function findMainBundleFile(assetsDir = DIST_ASSETS_DIR) {
  const files = readdirSync(assetsDir).filter((f) => /^index-.*\.js$/.test(f))
  if (files.length === 0) throw new Error(`No main entry bundle (index-*.js) found in ${assetsDir}`)
  // If more than one matches, the largest is the real entry (defensive --
  // Vite's own output has exactly one in this app's config).
  return files
    .map((f) => ({ file: f, size: statSync(join(assetsDir, f)).size }))
    .sort((a, b) => b.size - a.size)[0]
}

function main() {
  const { file, size } = findMainBundleFile()
  const kb = (size / 1024).toFixed(1)
  const budgetKb = (MAIN_BUNDLE_BUDGET_BYTES / 1024).toFixed(0)
  if (size > MAIN_BUNDLE_BUDGET_BYTES) {
    console.error(`✗ Main bundle ${file} is ${kb}KB, over the ${budgetKb}KB budget.`)
    console.error(`  Consider lazy-loading a heavy feature (see src/components/shared/AnimatedRoutes.tsx for the pattern).`)
    process.exit(1)
  }
  console.log(`✓ Main bundle ${file}: ${kb}KB (budget ${budgetKb}KB)`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
