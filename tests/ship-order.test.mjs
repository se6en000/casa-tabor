import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Overnight queue (5), 2026-09-29: the screenshot guard grew to ~5 minutes and held every deploy behind
// it (390 s ships). Now: live after tests + build; the screenshots follow, and a change is reported
// (exit 2) with the rollback line — never kept silently. A leftover test server on 4175 is stopped first.
const ship = readFileSync(new URL('../scripts/ship.sh', import.meta.url), 'utf8')
const at = (s) => { const i = ship.indexOf(s); assert.ok(i >= 0, `missing: ${s}`); return i }

test('ship: the screenshots run after the deploy and the kiosk, not before the commit', () => {
  // Oct 5: the 14 key screens (@smoke) on each ship; the full suite nightly (scripts/nightly-visual.sh).
  const screenshots = at('npm run test:visual:quick >"$WALL_LOG"')
  assert.ok(screenshots > at('npx vercel deploy --prebuilt --prod'), 'after the deploy')
  assert.ok(screenshots > at('bash pi/refresh-casa-kiosk.sh'), 'after the kiosk refresh')
  assert.equal(ship.match(/npm run test:visual:quick /g).length, 1, 'run once')
  assert.doesNotMatch(ship, /npm run test:visual:wall /, 'never the full suite on a ship')
  assert.match(ship, /exit 2/)
  assert.match(ship, /npx vercel rollback \$\{PREV_DEPLOY/)
})

test('ship: a leftover test server on the screenshot port is stopped before anything runs', () => {
  assert.ok(at('fuser -k 4175/tcp') < at('npm test >"$TEST_LOG"'))
})

test('ship: the full screen suite runs nightly, and the next ship shows its result', () => {
  const nightly = readFileSync(new URL('../scripts/nightly-visual.sh', import.meta.url), 'utf8')
  assert.match(nightly, /npm run test:visual:wall >"\$LOG"/)
  assert.match(nightly, /lsof -ti tcp:4175/)
  assert.match(nightly, /> "\$OUT\/last\.txt"/)
  assert.ok(at('.casa-nightly/last.txt') < at('npm test >"$TEST_LOG"'), 'shown before the tests run')
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.scripts['test:visual:quick'], 'playwright test --config playwright.wall.config.mjs --grep @smoke')
})
