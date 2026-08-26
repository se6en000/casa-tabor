import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Zero-Polling & Realtime Push Architecture Guardrails', () => {
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

  it('forbids active polling (refetchInterval) on Realtime-backed and static entities in src/hooks', () => {
    const hooksDir = path.resolve(__dirname, '../../src/hooks')
    const hookFiles = getAllSourceFiles(hooksDir)

    // Protected hooks that MUST be purely push-driven (refetchInterval: false)
    const realtimePushHooks = [
      'usePrepItems.ts',
      'useConflicts.ts',
      'useGroceryList.ts',
      'useNotifications.ts',
      'useFamilyMembers.ts',
      'useMemberAvailability.ts',
      'useHouseholdCaptureRules.ts',
    ]

    const violations: { file: string; line: number; content: string }[] = []

    for (const file of hookFiles) {
      const base = path.basename(file)
      if (!realtimePushHooks.includes(base)) continue

      const content = fs.readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      lines.forEach((line, idx) => {
        // Flag any non-false refetchInterval
        if (
          line.includes('refetchInterval:') &&
          !line.includes('refetchInterval: false') &&
          !line.includes('refetchIntervalMs') &&
          !line.includes('refetchIntervalInBackground')
        ) {
          violations.push({
            file: base,
            line: idx + 1,
            content: line.trim(),
          })
        }
      })
    }

    expect(
      violations,
      `Detected active polling intervals on Realtime-backed hooks that should be pure push:\n${JSON.stringify(
        violations,
        null,
        2
      )}`
    ).toEqual([])
  })
})
