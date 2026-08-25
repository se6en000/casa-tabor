import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Database Architecture & PostgREST Query Guardrails', () => {
  function getAllSourceFiles(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir)
    for (const file of files) {
      const filePath = path.join(dir, file)
      if (fs.statSync(filePath).isDirectory()) {
        if (!filePath.includes('node_modules') && !filePath.includes('.git') && !filePath.includes('dist')) {
          getAllSourceFiles(filePath, fileList)
        }
      } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        fileList.push(filePath)
      }
    }
    return fileList
  }

  it('prohibits nested !inner PostgREST joins across multi-resource tables', () => {
    const srcDir = path.resolve(__dirname, '../../src')
    const sourceFiles = getAllSourceFiles(srcDir)

    const violations: { file: string; match: string }[] = []

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      lines.forEach((line, idx) => {
        if (line.includes('!inner(') && !file.includes('guardrails')) {
          violations.push({
            file: `${path.relative(srcDir, file)}:${idx + 1}`,
            match: line.trim(),
          })
        }
      })
    }

    expect(
      violations,
      `Detected prohibited nested PostgREST '!inner' joins that cause sequential scan subplans on Postgres:\n${JSON.stringify(
        violations,
        null,
        2
      )}`
    ).toEqual([])
  })
})
