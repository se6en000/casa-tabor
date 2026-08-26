import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Supabase Realtime Channel & Singleton Architecture Guardrails', () => {
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

  it('prohibits dynamic per-component instance channel names (e.g. channelId/useId) that cause Realtime channel leaks', () => {
    const srcDir = path.resolve(__dirname, '../../src')
    const sourceFiles = getAllSourceFiles(srcDir)

    const violations: { file: string; line: number; content: string }[] = []

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      lines.forEach((line, idx) => {
        // Flag patterns like .channel(`..._${channelId}`) or .channel(channelRef.current)
        if (
          (line.includes('.channel(') && (line.includes('${channelId}') || line.includes('channelRef.current'))) &&
          !file.includes('guardrails')
        ) {
          violations.push({
            file: `${path.relative(srcDir, file)}`,
            line: idx + 1,
            content: line.trim(),
          })
        }
      })
    }

    expect(
      violations,
      `Detected dynamic per-component Realtime channel instances that bypass singletons:\n${JSON.stringify(
        violations,
        null,
        2
      )}`
    ).toEqual([])
  })
})
