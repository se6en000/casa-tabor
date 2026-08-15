import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('CookPage: hooks are declared before any conditional return statements', () => {
  const filePath = resolve(process.cwd(), 'src/pages/CookPage.tsx')
  const content = readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')

  // Find start and end of export default function CookPage()
  let inCookPage = false
  let firstReturnIndex = -1
  const hookViolations = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (/^export\s+default\s+function\s+CookPage\b/.test(line)) {
      inCookPage = true
      continue
    }

    if (inCookPage) {
      // Detect top-level conditional return in CookPage component body
      if (/^\s{2}if\s*\(.*return\b/.test(line) || /^\s{2}return\s*\(/.test(line)) {
        if (firstReturnIndex === -1) {
          firstReturnIndex = i + 1
        }
      }

      // Detect hook invocations
      if (/^\s{2}(?:const\s+.*=\s*)?use[A-Z]\w*\(/.test(line)) {
        if (firstReturnIndex !== -1) {
          hookViolations.push({
            line: i + 1,
            code: line.trim(),
            firstReturnLine: firstReturnIndex,
          })
        }
      }
    }
  }

  assert.equal(
    hookViolations.length,
    0,
    `Found hooks called after return statements in CookPage: ${JSON.stringify(hookViolations, null, 2)}`
  )
})
