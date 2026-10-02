import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The month check (P3.22 step 8): every answer and change on To do, projects and Coming up is logged
// with the screen it came from, and scripts/todo-month-check.mjs reads it back (what's used, what isn't).
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('the todos and coming-up functions log each answer and change, with its screen', () => {
  assert.match(read('supabase/functions/todos/index.ts'), /event: 'todo_use', channel: 'server', page: surface/)
  assert.match(read('supabase/functions/coming-up/index.ts'), /event: 'coming_up_use'/)
})

test('the wall and the phone say which they are', () => {
  assert.match(read('src/wall/useTodos.ts'), /body: \{ \.\.\.request, surface \}/)
  assert.match(read('src/wall/useComingUp.ts'), /action, key, surface/)
  assert.match(read('src/phone/PhoneFrame.tsx'), /useTodos\(\{ enabled: isJake, surface: 'phone' \}\)/)
  // Coming up left the phone (UX review, Oct 2): it stays on the wall, so the phone no longer loads it.
  assert.doesNotMatch(read('src/phone/PhoneFrame.tsx'), /useComingUp\(/)
})

test('the report reads it back: used, never used, noise, stalled projects', () => {
  const script = read('scripts/todo-month-check.mjs')
  for (const s of ['NEVER USED', 'snoozed 3+ times', 'STALLED 2+ weeks', "read_only: true"]) assert.ok(script.includes(s), s)
})
