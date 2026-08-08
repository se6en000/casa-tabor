import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('settings shell exposes a dedicated AI shortcuts entry and route', () => {
  const shell = readFileSync(new URL('../src/components/settings/SettingsShell.tsx', import.meta.url), 'utf8')
  const routes = readFileSync(new URL('../src/components/shared/AnimatedRoutes.tsx', import.meta.url), 'utf8')

  assert.match(shell, /label:\s*'AI Shortcuts'/)
  assert.match(shell, /to:\s*'\/settings\/ai\/shortcuts'/)
  assert.match(routes, /path="ai\/shortcuts"/)
})

test('AI settings page deep-links the shortcut section for direct navigation', () => {
  const source = readFileSync(new URL('../src/pages/AISettingsPage.tsx', import.meta.url), 'utf8')

  assert.match(source, /id="ai-shortcuts"/)
  assert.match(source, /location\.pathname === '\/settings\/ai\/shortcuts'/)
  assert.match(source, /scrollIntoView\(\{\s*behavior:\s*'smooth'/)
})
