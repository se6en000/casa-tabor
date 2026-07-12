import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const executeSource = await readFile(new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url), 'utf8')
const assistantSource = await readFile(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')

test('grocery mutations mark Casa as source and preserve iOS deletion tombstones', () => {
  assert.match(executeSource, /update\(\{ checked: args\.checked, last_modified_source: 'casa' \}\)/)
  assert.match(executeSource, /if \(tool === 'remove_grocery_item'\)[\s\S]*deleted_at: new Date\(\)\.toISOString\(\), last_modified_source: 'casa'/)
  assert.match(executeSource, /if \(tool === 'clear_checked_grocery_items'\)[\s\S]*\.update\(\{ deleted_at: new Date\(\)\.toISOString\(\), last_modified_source: 'casa' \}\)/)
  assert.doesNotMatch(executeSource, /from\('grocery_items'\)\.delete\(\)\.eq\('checked', true\)/)
})

test('grocery semantic dispatch precedes model prompt execution', () => {
  const dispatch = assistantSource.indexOf("server_ai_assistant_grocery_semantic_dispatch")
  const modelCall = assistantSource.indexOf('const rawResult = await callGeminiWithTools(history)')
  assert.ok(dispatch > 0)
  assert.ok(modelCall > dispatch)
  assert.match(assistantSource, /semantic_intent: groceryFrame\.intent/)
})
