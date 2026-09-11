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
// It also fails on a file that can't be checked AT ALL (a module resolution
// failure, a syntax error before type-checking even starts, etc.) -- that
// output has no TS#### code, so naive code-counting would silently treat it
// as "0 errors", indistinguishable from a genuinely clean file. Found via
// send-push-notification/index.ts hitting an unrelated, pre-existing
// "Could not find a matching package for 'npm:web-push'" resolution error.
//
// Usage: node scripts/deno-typecheck.mjs

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const FUNCTIONS_DIR = path.join(ROOT, 'supabase', 'functions')

export const BLOCKING_CODES = new Set(['TS2304', 'TS2552'])

// Only ever called on output from a *failed* deno check invocation (the main
// loop below `continue`s past successful ones first) -- so no TS#### code
// present means the failure itself has no code, i.e. a resolution/syntax
// failure that prevented type-checking from running at all, not "no errors".
export function classifyCheckOutput(output) {
  const codes = [...String(output ?? '').matchAll(/TS(\d+)/g)].map((m) => `TS${m[1]}`)
  if (codes.length === 0) {
    return { blocking: [], advisory: [], resolutionFailure: true }
  }
  const blocking = codes.filter((code) => BLOCKING_CODES.has(code))
  const advisory = codes.filter((code) => !BLOCKING_CODES.has(code))
  return { blocking, advisory, resolutionFailure: false }
}

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

function main() {
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
  let resolutionFailureCount = 0
  const blockingDetails = []
  const resolutionFailureDetails = []

  for (const entrypoint of entrypoints) {
    const relative = path.relative(ROOT, entrypoint)
    let output = ''
    try {
      // --node-modules-dir=none: without it, Deno resolves npm: specifiers
      // against this repo's own frontend node_modules/ (from `npm install`)
      // instead of its own independent npm cache. Packages the frontend
      // doesn't also use (e.g. web-push, only imported by an edge function)
      // then fail to resolve at all -- a real resolution failure, not a type
      // error, found via send-push-notification/index.ts. Forcing Deno's own
      // resolution fixes that. (This does not affect what actually deploys --
      // `supabase functions deploy` never reads this repo's deno.json/lock
      // without an explicit --import-map flag, which nothing here passes.)
      execFileSync(denoBin, ['check', '--node-modules-dir=none', entrypoint], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      continue
    } catch (error) {
      output = `${error.stdout ?? ''}${error.stderr ?? ''}`
    }
    const { blocking, advisory, resolutionFailure } = classifyCheckOutput(output)
    advisoryCount += advisory.length
    if (resolutionFailure) {
      resolutionFailureCount += 1
      resolutionFailureDetails.push({ relative, output })
    } else if (blocking.length > 0) {
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

  if (resolutionFailureCount > 0) {
    console.error(`\n✗ ${resolutionFailureCount} file(s) could not be checked at all (module resolution or syntax failure):\n`)
    for (const { relative, output } of resolutionFailureDetails) {
      console.error(`--- ${relative} ---`)
      console.error(output)
    }
  }

  if (blockingCount > 0) {
    console.error(`\n✗ ${blockingCount} undefined-name error(s) found -- these are always real bugs:\n`)
    for (const { relative, output } of blockingDetails) {
      console.error(`--- ${relative} ---`)
      console.error(output)
    }
  }

  if (blockingCount > 0 || resolutionFailureCount > 0) {
    process.exit(1)
  }

  console.log(`✓ No undefined-name errors or resolution failures across ${entrypoints.length} Supabase edge functions.`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main()
