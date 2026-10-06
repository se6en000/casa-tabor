import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const executeSource = await readFile(new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url), 'utf8')
const assistantSource = await readFile(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
const writeSource = await readFile(new URL('../supabase/functions/_shared/assistant-grocery-write.mjs', import.meta.url), 'utf8')

test('grocery mutations mark Casa as source and preserve iOS deletion tombstones', () => {
  assert.match(executeSource, /update\(\{ checked: args\.checked, last_modified_source: 'casa' \}\)/)
  assert.match(executeSource, /if \(tool === 'remove_grocery_item'\)[\s\S]*deleted_at: new Date\(\)\.toISOString\(\), last_modified_source: 'casa'/)
  assert.match(executeSource, /if \(tool === 'clear_checked_grocery_items'\)[\s\S]*\.update\(\{ deleted_at: new Date\(\)\.toISOString\(\), last_modified_source: 'casa' \}\)/)
  assert.doesNotMatch(executeSource, /from\('grocery_items'\)\.delete\(\)\.eq\('checked', true\)/)
})

test('agent grocery updates enforce proposed versions and preserve structured units', () => {
  assert.match(executeSource, /expected_updated_at/)
  assert.match(executeSource, /query = query\.eq\('updated_at', expectedUpdatedAt\)/)
  assert.match(executeSource, /\.\.\.\(hasUnit \? \{ unit \} : \{\}\)/)
  assert.match(executeSource, /Grocery item changed since this action was proposed/)
})

test('immediate and confirmed grocery adds share duplicate-safe write logic', () => {
  assert.match(assistantSource, /import \{ groceryAddedText, saveGroceryItems \}/)
  assert.match(executeSource, /import \{ saveGroceryItems \}/)
  assert.match(writeSource, /error\?\.code === '23505'/)
  assert.match(writeSource, /already_present: true/)
  assert.match(writeSource, /last_modified_source: 'casa'/)
})

// The phone and the wall ask in the full-AI lane, where every change was a card: groceries are saved there too.
test('in the full-AI lane a grocery add is saved and said, the rest stay cards', () => {
  const start = assistantSource.indexOf("const groceryCards = cards.filter((c) => c.tool === 'add_grocery_items')")
  assert.ok(start > 0)
  const block = assistantSource.slice(start, start + 1300)
  assert.match(block, /await saveGroceryItems\(sb, /)
  assert.match(block, /groceryAddedText\(result\.items/)
  assert.match(block, /cards = cards\.filter\(\(c\) => c\.tool !== 'add_grocery_items'\)/)
  assert.match(block, /write_verified: !dryRun/)
})

// Oct 5: the nightly check's dry run "add milk and a dozen eggs to the grocery list" put them on the real list.
test('a dry run never saves groceries: it says what it would add', () => {
  const start = assistantSource.indexOf("const groceryCards = cards.filter((c) => c.tool === 'add_grocery_items')")
  const block = assistantSource.slice(start, start + 1300)
  assert.match(block, /const result = dryRun\s*\?\s*\{ items: items\.map/)
  assert.match(block, /: await saveGroceryItems\(sb, items\)/)
})

import { groceryAddedText } from '../supabase/functions/_shared/assistant-grocery-write.mjs'
test('what a straight-away add says', () => {
  assert.equal(groceryAddedText([{ name: "Tate's cookies" }]), "Added Tate's cookies to the list.")
  assert.equal(groceryAddedText([{ name: 'Milk' }, { name: 'Eggs' }, { name: 'Bread', already_present: true }]), 'Added Milk and Eggs to the list. Bread was already on it.')
})

// The phone's list shows what Casa just added without waiting for the next refetch.
test('a grocery-added answer refetches the list on the phone and the wall', async () => {
  const hook = await readFile(new URL('../src/hooks/useAIAssistant.ts', import.meta.url), 'utf8')
  const turn = await readFile(new URL('../src/wall/useAssistantTurn.ts', import.meta.url), 'utf8')
  assert.match(hook, /semantic_intent === 'full_ai\.grocery_added' \? \{ groceryAdded: true \}/)
  assert.match(turn, /if \(groceryAnswer\) void queryClient\.invalidateQueries\(\{ queryKey: \['grocery'\] \}\)/)
})
