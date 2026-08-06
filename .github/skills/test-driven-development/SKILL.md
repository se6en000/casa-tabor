---
name: test-driven-development
description: "Enforce strict Red-Green-Refactor Test-Driven Development for Casa Tabor's Node --test suite. Use when the user asks to implement, fix, add a feature, add functionality, refactor, or otherwise change runtime behavior in src/, supabase/functions/, or scripts/ — write a failing test first, then the minimal code to pass it, then refactor."
argument-hint: "Optional: the behavior or bug you are about to implement/fix"
user-invocable: true
---

# Test-Driven Development (Red, Green, Refactor)

Casa Tabor has no Jest/Vitest/Mocha. The single test runner is Node's built-in
test runner over `.mjs` files in `tests/`, executed with `node --test` (see
`npm test` in [package.json](/Users/taboj/Public/casa-tabor.worktrees/apt-link-event-details-navigation/package.json)).
Node 24's native TypeScript type-stripping lets test files `import` `.ts`/`.tsx`
source directly — no ts-node, no babel, no jsdom.

This skill governs **how** you write code that changes behavior: test-first,
in small loops. It does not replace [pro-fix-playbook](/Users/taboj/Public/casa-tabor.worktrees/apt-link-event-details-navigation/.github/skills/pro-fix-playbook/SKILL.md),
which governs risk classification and how much validation a change needs
overall. When both apply, use pro-fix-playbook to size the work and this
skill's loop to execute step 5 ("Implement root-cause-first"). Don't run the
full suite on every Red/Green cycle — that's pro-fix-playbook's job at the
release boundary; this skill runs only the targeted test file while iterating.

## When this applies

Use the full loop for:
- New logic in `src/**` (hooks, utils, pure functions, component behavior you
  can assert on).
- New or changed Supabase Edge Function behavior in `supabase/functions/**`.
- Bug fixes anywhere behavior is observable and testable.
- Refactors that must preserve existing behavior (write/confirm the
  characterization test *before* touching the implementation).

Skip the loop (but still run the build/lint gates) for:
- Pure docs, comments, copy, or markdown.
- Config-only changes with no behavioral branch (e.g. bumping a constant that
  has no conditional logic depending on it).
- Style-only CSS/Tailwind class changes with no logic (covered by
  `npm run style:check`, not `node --test`).
- Throwaway HTML/script prototypes explicitly requested as scratch files, not
  shipped code.

If a task is genuinely exploratory (the user is asking "what's possible?" not
"implement this"), skip TDD and say so — don't manufacture tests for
prototypes.

## The loop

Work in the smallest possible increment. Repeat per behavior, not once per
task.

### 1. Red — write a failing test first

- Find or create the right file: `tests/<feature-name>.test.mjs`. Check for an
  existing file covering the area first (`ls tests/ | grep <topic>`) — most
  areas already have one; add cases to it rather than fragmenting coverage.
- Import the real source module directly. Never re-implement the logic inline
  in the test to make it pass trivially.
- Assert the *behavior*, not the implementation detail, unless the code under
  test is not independently executable (see "Two test styles" below).
- Run only this file and confirm it fails **for the expected reason** (missing
  export, wrong value, thrown error) — not a typo or import error:
  ```bash
  node --test tests/<feature-name>.test.mjs
  ```
- Do not write the implementation yet. Do not write more than one new failing
  case at a time for non-trivial behavior.

### 2. Green — minimal code to pass

- Write the smallest change that makes the failing assertion pass. Do not
  add unrequested behavior, extra options, or speculative abstraction.
- Re-run the same targeted file:
  ```bash
  node --test tests/<feature-name>.test.mjs
  ```
- If it still fails, fix the implementation, not the test — unless the test
  itself encoded the wrong expectation, in which case say so explicitly before
  changing it.

### 3. Refactor — clean up with the safety net on

- With the test green, simplify: remove duplication, rename, extract, align
  with existing patterns in neighboring files.
- Re-run the targeted file after every refactor step; keep it green throughout.
- Do not refactor and add new behavior in the same step.

### 4. Repeat, then gate at the end

- Repeat Red → Green → Refactor for the next case/edge condition.
- When the feature/fix is complete, run the full gates once (per
  pro-fix-playbook's tiering — Tier 2-3 work always gets this before handoff):
  ```bash
  npx tsc -b
  npm test
  ```
- Compare pass/fail counts to the pre-existing baseline before claiming "no
  regressions" — this repo currently has a small number of known
  pre-existing failures unrelated to any given change; don't count those
  against your work, but don't silently absorb new ones either.
- Only run `npm run build` when bundling/compilation/output matters for the
  change (per pro-fix-playbook's validation-by-risk rule).

## Two test styles used in this repo

Most Casa Tabor logic is directly executable and should get a real behavioral
test (style A). Some logic (Deno edge functions, React components without a
DOM harness, SQL migrations) is not independently invokable under
`node --test`; those get a source-contract test that reads the file and
asserts on it with regex (style B). Prefer style A whenever the code is a
plain function/hook you can import and call — don't reach for style B out of
convenience.

**Style A — executable unit test (preferred default):**
```js
import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeAllDayEventRange } from '../src/utils/allDayEventRange.ts'

test('normalizeAllDayEventRange clamps end before start to the same day', () => {
  assert.deepEqual(normalizeAllDayEventRange('2026-07-21T00:00', '2026-07-20T23:59'), {
    start: '2026-07-21T00:00:00.000Z',
    end: '2026-07-21T23:59:59.000Z',
  })
})
```

**Style B — source-contract test (only when the code isn't independently
executable, e.g. a Deno edge function or a migration file):**
```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url), 'utf8')

test('associate_contact_place uses fuzzy matching before creating a new place', () => {
  assert.match(source, /rpc\('find_similar_places'/)
  assert.doesNotMatch(source, /\.eq\('name', placeName\)/)
})
```

Style B is a weaker guarantee than style A (it can't catch logic errors inside
a matched block) — use it only when there's no other way to exercise the code,
and prefer extracting testable pure functions out of edge functions/components
when a change would otherwise force style B.

## Reference Example (copy-paste starting point)

Minimal file to start a new `tests/<feature-name>.test.mjs` from scratch,
matching this repo's actual assertion syntax exactly:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import { yourFunction } from '../src/utils/yourModule.ts'

test('yourFunction does the expected thing for the common case', () => {
  assert.equal(yourFunction('input'), 'expected-output')
})

test('yourFunction handles the edge case', () => {
  assert.throws(() => yourFunction(null), /invalid input/)
})
```

Run it in isolation while iterating:
```bash
node --test tests/<feature-name>.test.mjs
```

Run the full suite once before handoff:
```bash
npm test
```
