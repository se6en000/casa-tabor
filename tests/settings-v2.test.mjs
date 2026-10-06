import test from 'node:test'
import assert from 'node:assert/strict'
import { SETTINGS_PAGES, ownerId, pageFromPath, searchPages, money, ago } from '../src/settings/model.ts'

// Settings V2 (canvas 47; Jake, Oct 5: "redo the settings page … keep the general and advanced areas").

test('six household pages and five of Jake’s', () => {
  assert.deepEqual(SETTINGS_PAGES.filter((p) => !p.advanced).map((p) => p.id), ['family', 'places', 'calendars', 'wall', 'knows', 'chores'])
  assert.deepEqual(SETTINGS_PAGES.filter((p) => p.advanced).map((p) => p.id), ['usage', 'limits', 'checks', 'voice', 'maintenance'])
})

test('Advanced is the first parent’s (Jake), not every admin’s (Kelly is one too)', () => {
  const members = [
    { id: 'kelly', role: 'parent', sort_order: 2, is_admin: true },
    { id: 'liv', role: 'child', sort_order: 3 },
    { id: 'jake', role: 'parent', sort_order: 1, is_admin: true },
  ]
  assert.equal(ownerId(members), 'jake')
  assert.equal(ownerId([{ id: 'liv', role: 'child', sort_order: 3 }]), null)
})

test('old settings links land on the page that took their place', () => {
  assert.equal(pageFromPath('/settings'), null)
  assert.equal(pageFromPath('/settings/family'), 'family')
  assert.equal(pageFromPath('/settings/google'), 'calendars') // Google's sign-in comes back here
  assert.equal(pageFromPath('/settings/status'), 'usage')
  assert.equal(pageFromPath('/settings/ai'), 'limits')
  assert.equal(pageFromPath('/settings/display'), 'wall')
  assert.equal(pageFromPath('/settings/nonsense'), null)
})

test('search finds a page by the words people use, and hides Advanced from everyone but Jake', () => {
  assert.equal(searchPages('face id', true)[0].id, 'family')
  assert.equal(searchPages('brightness', true)[0].id, 'wall')
  assert.equal(searchPages('breaker', true)[0].id, 'limits')
  assert.deepEqual(searchPages('breaker', false), [])
  assert.equal(searchPages('keep me', false)[0].id, 'calendars')
  assert.deepEqual(searchPages('   ', true), [])
})

test('money and time read at a glance', () => {
  assert.equal(money(2.314), '$2.31')
  assert.equal(money(0.06), '6¢')
  assert.equal(money(0.001), '1¢')
  assert.equal(money(0), '$0')
  assert.equal(money(null), '—')
  const now = new Date('2026-10-06T12:00:00Z')
  assert.equal(ago('2026-10-06T11:56:00Z', now), '4 min ago')
  assert.equal(ago('2026-10-06T10:00:00Z', now), '2 hr ago')
  assert.equal(ago(null, now), 'never')
})

test('every AI call says who caused it: the nightly check, testing, or (unsaid) the family', async () => {
  const { causeFromCorrelation } = await import('../supabase/functions/_shared/provider-call-ledger.mjs')
  assert.equal(causeFromCorrelation('nightly-check:1791252072977'), 'nightly')
  assert.equal(causeFromCorrelation('which-live:123'), 'testing')
  assert.equal(causeFromCorrelation('plan-talk-eval:9'), 'testing')
  assert.equal(causeFromCorrelation('wall:muopf1va'), null)
  assert.equal(causeFromCorrelation(null), null)
})

test('two weeks of nights: green only when every check that night passed', async () => {
  const { nightStatus } = await import('../src/settings/model.ts')
  assert.deepEqual(nightStatus([
    { run_date: '2026-10-06', ok: true }, { run_date: '2026-10-06', ok: false },
    { run_date: '2026-10-05', ok: true },
  ]), [{ date: '2026-10-05', ok: true }, { date: '2026-10-06', ok: false }])
})

test('the wall reloads only for a refresh asked after it loaded', async () => {
  const { reloadAsked } = await import('../src/wall/wallReload.ts')
  const loaded = Date.parse('2026-10-06T08:00:00Z')
  assert.equal(reloadAsked('2026-10-06T08:05:00Z', loaded), true)
  assert.equal(reloadAsked('2026-10-06T07:55:00Z', loaded), false)
  assert.equal(reloadAsked(null, loaded), false)
  assert.equal(reloadAsked('nonsense', loaded), false)
})

test('the new settings change the breaker only through its merging functions, never a whole-value overwrite', async () => {
  const { readFileSync } = await import('node:fs')
  const live = readFileSync(new URL('../src/settings/liveSource.ts', import.meta.url), 'utf8')
  assert.match(live, /rpc\('set_ai_circuit_breaker', /)
  assert.match(live, /rpc\('set_ai_circuit_breaker_caps', /)
  assert.doesNotMatch(live, /setSetting\('ai_circuit_breaker'/)
})
