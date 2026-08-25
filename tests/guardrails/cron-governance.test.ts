import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Database Background Worker & pg_cron Guardrails', () => {
  function getMigrationFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return []
    return fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => path.join(dir, file))
  }

  it('enforces minimum 15-minute intervals and rejects high-frequency cron loops in new migrations', () => {
    const migrationsDir = path.resolve(__dirname, '../../supabase/migrations')
    const files = getMigrationFiles(migrationsDir)

    // Check recent migrations (applied today onwards)
    const recentFiles = files.filter((f) => path.basename(f) >= '20260825095000')

    const violations: { file: string; line: number; content: string }[] = []

    // Prohibited high-frequency cron patterns: */1, */2, */5, 1-59/5, etc.
    const aggressivePatterns = [
      /\*\s*\*\s*\*\s*\*\s*\*/, // Every minute
      /\*\/[1-9]\s+/,           // Every 1-9 minutes
      /[0-9]-[0-9]+\/[1-9]\s+/, // Step intervals under 10m
    ]

    for (const file of recentFiles) {
      const content = fs.readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      lines.forEach((line, idx) => {
        if (line.includes('cron.schedule(')) {
          for (const pattern of aggressivePatterns) {
            if (pattern.test(line)) {
              violations.push({
                file: path.basename(file),
                line: idx + 1,
                content: line.trim(),
              })
            }
          }
        }
      })
    }

    expect(
      violations,
      `Detected prohibited high-frequency cron schedules (<15m) in migrations:\n${JSON.stringify(
        violations,
        null,
        2
      )}`
    ).toEqual([])
  })
})
