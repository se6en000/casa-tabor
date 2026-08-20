import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('memory settings has a dedicated canonical destination', () => {
  const aiSettings = readFileSync(new URL('../src/pages/AISettingsPage.tsx', import.meta.url), 'utf8')
  const memorySettings = readFileSync(new URL('../src/pages/MemorySettingsPage.tsx', import.meta.url), 'utf8')
  const routes = readFileSync(new URL('../src/components/shared/AnimatedRoutes.tsx', import.meta.url), 'utf8')
  const shell = readFileSync(new URL('../src/components/settings/SettingsShell.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(aiSettings, /ai_memory_observations/)
  assert.match(memorySettings, /create_memory/)
  assert.match(memorySettings, /Food & meal preferences/)
  assert.match(routes, /path="memory"/)
  assert.match(shell, /\/settings\/memory/)
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
