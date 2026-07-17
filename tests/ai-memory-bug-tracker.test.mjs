import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('ai settings keeps opt-in memory capture and links to dedicated bug tracker', () => {
  const aiSettings = readFileSync(new URL('../src/pages/AISettingsPage.tsx', import.meta.url), 'utf8')
  const bugSettings = readFileSync(new URL('../src/pages/BugTrackerSettingsPage.tsx', import.meta.url), 'utf8')
  const routes = readFileSync(new URL('../src/components/shared/AnimatedRoutes.tsx', import.meta.url), 'utf8')
  const shell = readFileSync(new URL('../src/components/settings/SettingsShell.tsx', import.meta.url), 'utf8')
  assert.match(aiSettings, /ai_memory_capture_config/)
  assert.match(aiSettings, /from\('ai_memory_observations'\)/)
  assert.match(aiSettings, /Open Bug Tracker/)
  assert.match(bugSettings, /from\('ai_bug_reports'\)/)
  assert.match(routes, /path="bug-tracker"/)
  assert.match(shell, /\/settings\/bug-tracker/)
})

test('supabase migration defines memory and bug report tables with RLS', () => {
  const migration = readFileSync(
    new URL('../supabase/migrations/20260717190000_ai_memory_and_bug_reports.sql', import.meta.url),
    'utf8',
  )
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.ai_memory_observations/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.ai_bug_reports/)
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/)
})
