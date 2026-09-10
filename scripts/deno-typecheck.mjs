#!/usr/bin/env node
// scripts/deno-typecheck.mjs
//
// Type-checks every Supabase edge function entrypoint with `deno check`.
// supabase/functions/**/*.ts gets zero type-checking from `tsc -b` (that
// project only covers src/), so a plain undefined-variable reference can sit
// in production code, completely invisible, until the exact code path finally
// runs. That's exactly what happened: a ReferenceError in ai-assistant/
// index.ts went undetected until an unrelated change finally exercised that
// branch, causing a live 500 error.
//
// This repo has a real backlog of pre-existing Deno/TypeScript errors here
// (mostly Supabase client generic-type mismatches) that aren't practical to
// fix in one pass. Rather than block on all of them, this script fails ONLY
// on the error class that actually caused that incident -- "Cannot find
// name" (TS2304) and "Cannot find name, did you mean" (TS2552) -- which can
// never be a legitimate thing to ignore. Every other error category is
// reported for visibility but does not fail the check.
//
// Usage: node scripts/deno-typecheck.mjs

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const FUNCTIONS_DIR = path.join(ROOT, 'supabase', 'functions')

const BLOCKING_CODES = new Set(['TS2304', 'TS2552'])

function resolveDenoBinary() {
  const candidates = ['deno', path.join(process.env.HOME ?? '', '.deno', 'bin', 'deno')]
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' })
      return candidate
    } catch {
      // try next candidate
    }
  }
  return null
}

const denoBin = resolveDenoBinary()
if (!denoBin) {
  console.error('deno is not installed. Install it with: curl -fsSL https://deno.land/install.sh | sh')
  process.exit(1)
}

const entrypoints = fs.readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => path.join(FUNCTIONS_DIR, entry.name, 'index.ts'))
  .filter((entrypoint) => fs.existsSync(entrypoint))
  .sort()

let blockingCount = 0
let advisoryCount = 0
const blockingDetails = []

for (const entrypoint of entrypoints) {
  const relative = path.relative(ROOT, entrypoint)
  let output = ''
  try {
    execFileSync(denoBin, ['check', entrypoint], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    continue
  } catch (error) {
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`
  }
  const codes = [...output.matchAll(/TS(\d+)/g)].map((m) => `TS${m[1]}`)
  const blocking = codes.filter((code) => BLOCKING_CODES.has(code))
  advisoryCount += codes.length - blocking.length
  if (blocking.length > 0) {
    blockingCount += blocking.length
    blockingDetails.push({ relative, output })
  }
}

if (advisoryCount > 0) {
  console.warn(
    `⚠ ${advisoryCount} pre-existing Deno type error(s) across edge functions ` +
    `(not undefined-name errors) -- not blocking, worth paying down over time.\n`,
  )
}

if (blockingCount > 0) {
  console.error(`\n✗ ${blockingCount} undefined-name error(s) found -- these are always real bugs:\n`)
  for (const { relative, output } of blockingDetails) {
    console.error(`--- ${relative} ---`)
    console.error(output)
  }
  process.exit(1)
}

console.log(`✓ No undefined-name errors across ${entrypoints.length} Supabase edge functions.`)
