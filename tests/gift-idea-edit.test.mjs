import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Jake, 2026-09-29: "on gift ideas, allow me to edit them, some brands don't get translated well and I
// need to correct it, otherwise I will forget what I was talking about." Voice mishears brand names.
const fn = readFileSync(new URL('../supabase/functions/coming-up/index.ts', import.meta.url), 'utf8')

test('the list carries each idea’s id and who it’s for, so it can be edited (and kept off their phone)', () => {
  assert.match(fn, /from\('gift_ideas'\)\.select\('id, for_name, for_member_id, idea, created_at'\)/)
})

test('an idea can be corrected in place, or removed', () => {
  const part = fn.slice(fn.indexOf("if (action === 'idea_edit' || action === 'idea_remove')"))
  assert.ok(part.length > 100, 'the actions exist')
  assert.match(part, /update\(action === 'idea_edit' \? \{ idea: text \} : \{ dismissed_at: now\.toISOString\(\) \}\)/)
  assert.match(part, /if \(action === 'idea_edit' && !text\) return json\(\{ error: 'An idea needs words' \}, 400\)/)
})
