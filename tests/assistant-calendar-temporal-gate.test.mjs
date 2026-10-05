import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const assistantSource = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
const drawerSource = readFileSync(new URL('../src/components/shared/AIChatDrawer.tsx', import.meta.url), 'utf8')
const hookSource = readFileSync(new URL('../src/hooks/useAIAssistant.ts', import.meta.url), 'utf8')

test('client preserves source message IDs and explicitly confirms conflict overrides', () => {
  assert.match(hookSource, /id: m\.id/)
  assert.match(drawerSource, /allow_calendar_conflicts/)
})
