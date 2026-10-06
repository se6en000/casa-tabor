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

test('the wall’s light: where a colour temperature sits, in words, and drawn', async () => {
  const { spectrumAt, lightWords, cctColor, tintColor } = await import('../src/settings/model.ts')
  assert.equal(spectrumAt(2500), 0)
  assert.equal(spectrumAt(6500), 1)
  assert.equal(spectrumAt(4500), 0.5)
  assert.equal(spectrumAt(9000), 1)
  assert.equal(lightWords(2800), 'candle-warm')
  assert.equal(lightWords(4366), 'neutral')
  assert.equal(lightWords(3793), 'warm')
  assert.equal(lightWords(null), 'not measured')
  // Warm light is orange-ish (red high, blue low); daylight is near white.
  const [r, , b] = cctColor(2700).match(/\d+/g).map(Number)
  assert.ok(r === 255 && b < 200, cctColor(2700))
  assert.equal(cctColor(6600), 'rgb(255, 255, 255)')
  // The screen's gains 50/45/41 (tinted warm) turn white into a warm white.
  assert.equal(tintColor([50, 45, 41]), 'rgb(255, 230, 209)')
  assert.equal(tintColor(null), null)
})

// Family profiles (Jake, Oct 6: "change the name, nicknames, add a pet, change the profile avatar color").
test('a picked colour is that person’s; the rest keep following the family’s order, skipping it', async () => {
  const { pigmentIndexes } = await import('../src/wall/score.ts')
  const fam = [{ id: 'jake', name: 'Jake', sort_order: 1 }, { id: 'kelly', name: 'Kelly', sort_order: 2 }, { id: 'liv', name: 'Liv', sort_order: 3 }]
  // Nobody picked: exactly as always.
  assert.deepEqual([...pigmentIndexes(fam).entries()], [['jake', 0], ['kelly', 1], ['liv', 2]])
  // Liv picks Jake's colour (0): Jake and Kelly move along to the next free ones, Liv has hers.
  const picked = pigmentIndexes([...fam.slice(0, 2), { ...fam[2], pigment: 0 }])
  assert.equal(picked.get('liv'), 0)
  assert.equal(picked.get('jake'), 1)
  assert.equal(picked.get('kelly'), 2)
})

test('the assistant knows a person by their nicknames too', async () => {
  const { memberNamed } = await import('../supabase/functions/_shared/family-names.mjs')
  const fam = [{ id: 'liv', name: 'Liv', full_name: 'Olivia Tabor', nicknames: ['Livvy', 'Bug'] }, { id: 'jake', name: 'Jake', nicknames: [] }]
  assert.equal(memberNamed('livvy', fam)?.id, 'liv')
  assert.equal(memberNamed('Bug', fam)?.id, 'liv')
  assert.equal(memberNamed('Olivia', fam)?.id, 'liv')
  assert.equal(memberNamed('Buggy', fam), null)
})

test('picking someone’s colour swaps the two; moving someone keeps everyone’s colour', async () => {
  const { pickColor, moveInOrder } = await import('../src/settings/model.ts')
  const { pigmentIndexes } = await import('../src/wall/score.ts')
  const fam = [{ id: 'jake', name: 'Jake', sort_order: 1 }, { id: 'kelly', name: 'Kelly', sort_order: 2 }, { id: 'liv', name: 'Liv', sort_order: 3 }, { id: 'emme', name: 'Emme', sort_order: 4 }]
  const shown = pigmentIndexes(fam)
  const swap = pickColor('liv', 0, shown)
  assert.deepEqual(swap, [{ id: 'liv', pigment: 0 }, { id: 'jake', pigment: 2 }])
  const after = pigmentIndexes(fam.map((m) => ({ ...m, ...(swap.find((c) => c.id === m.id) ?? {}) })))
  assert.deepEqual([...after.entries()], [['jake', 2], ['kelly', 1], ['liv', 0], ['emme', 3]])
  assert.deepEqual(pickColor('liv', 2, shown), [])
  // Liv moves up past Kelly: places swap, colours stay with the people, Emme's doesn't move.
  const move = moveInOrder('liv', -1, fam, shown)
  const moved = pigmentIndexes(fam.map((m) => ({ ...m, ...(move.find((c) => c.id === m.id) ?? {}) })))
  assert.equal(moved.get('liv'), 2)
  assert.equal(moved.get('kelly'), 1)
  assert.equal(moved.get('emme'), 3)
  assert.deepEqual(move.map((c) => [c.id, c.sort_order]), [['liv', 2], ['kelly', 3]])
  assert.deepEqual(moveInOrder('jake', -1, fam, shown), [])
  // Two at the same place (Owen and the family mailbox were both 5) still come out in the new order.
  assert.deepEqual(moveInOrder('b', -1, [{ id: 'a', sort_order: 5 }, { id: 'b', sort_order: 5 }], new Map()).map((c) => c.sort_order), [4, 5])
})

// Jake, Oct 6: "taborfamilyemail is saying last checked on Sept 30th" — its calendar sync failed every run on an event
// already saved from Jake's calendar (the same Google event on both: events_google_event_id_key).
test('calendar sync: an event already saved from another family calendar is left as is, never inserted twice', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../supabase/functions/sync-calendars/index.ts', import.meta.url), 'utf8')
  const legacy = src.slice(src.indexOf("if (legacy && (!legacy.source_member_id"), src.indexOf("let eventId: string"))
  assert.match(legacy, /\} else if \(legacy\) \{[\s\S]*return\s*\}/)
  assert.match(src, /error\?\.code === '23505' && \/google_event_id\/\.test\(error\.message\)\) return/)
})

// Jake, Oct 6: "adding someone/pet to the family fails save" — family_members' old colour columns were required with
// no default, and Settings › Family's insert (name, role, drives, order, on the wall) doesn't set them.
test('adding someone needs nothing the new settings don’t send: the old colour columns have defaults', async () => {
  const { readFileSync, readdirSync } = await import('node:fs')
  const dir = new URL('../supabase/migrations/', import.meta.url)
  const all = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n')
  assert.match(all, /alter table public\.family_members alter column color_hex set default/)
  assert.match(all, /alter table public\.family_members alter column color_name set default/)
  const live = readFileSync(new URL('../src/settings/liveSource.ts', import.meta.url), 'utf8')
  const insert = live.slice(live.indexOf("from('family_members').insert("), live.indexOf("from('family_members').insert(") + 300)
  assert.doesNotMatch(insert, /color_hex|color_name/)
})

// Checks you can dig into (Jake, Oct 6: "allow me to dig into this information more, click and show me the details,
// allow me to edit the bugs captured, prioritize, delete if not relevant any more").
test('a night’s check in a short line — no log path in the side list', async () => {
  const { checkLine } = await import('../src/settings/model.ts')
  assert.equal(checkLine({ kind: 'screens', ok: false, summary: 'Tue Oct 6 3:47 AM FAILED — 11 failed (log: /home/jake/.casa-nightly/visual-20261006.log)', details: [] }), '11 screens failed')
  assert.equal(checkLine({ kind: 'screens', ok: false, summary: 'Tue Oct 6 3:47 AM FAILED — 1 failed (log: x)', details: [] }), '1 screen failed')
  assert.equal(checkLine({ kind: 'screens', ok: true, summary: 'Tue Oct 6 3:47 AM passed — 184 passed', details: [] }), 'Screens all passed')
  assert.equal(checkLine({ kind: 'assistant', ok: false, summary: '1 of 18 assistant checks failed: Marking a to-do done', details: [] }), '1 of 18 assistant checks failed')
  assert.equal(checkLine({ kind: 'assistant', ok: true, summary: 'All 18 assistant checks passed', details: [] }), 'All 18 assistant checks passed')
})

test('a failed screen: which part of the app, what it checks, where its test is', async () => {
  const { screenFailures } = await import('../src/settings/model.ts')
  const got = screenFailures([
    'Tue Oct 6 3:47 AM FAILED — 11 failed (log: /x.log)',
    'visual-regression/wall.spec.mjs:1100:1 › wall: an event with nobody on it waits on the "No one yet" row; a tap opens it on Who ',
    'visual-regression/phone.spec.mjs:1009:1 › phone: Casa — the keyboard comes up',
    'visual-regression/settings.spec.mjs:77:1 › settings: what the assistant knows — yes moves it to sure',
  ])
  assert.deepEqual(got, [
    { area: 'The wall', name: 'An event with nobody on it waits on the "No one yet" row; a tap opens it on Who', where: 'wall.spec.mjs:1100' },
    { area: 'The phone', name: 'Casa — the keyboard comes up', where: 'phone.spec.mjs:1009' },
    { area: 'Settings', name: 'What the assistant knows — yes moves it to sure', where: 'settings.spec.mjs:77' },
  ])
})

test('the bug box: most urgent first, then newest; closed ones last', async () => {
  const { sortBugs } = await import('../src/settings/model.ts')
  const bugs = [
    { id: 'a', severity: 'low', status: 'open', created_at: '2026-10-05T00:00:00Z' },
    { id: 'b', severity: 'high', status: 'open', created_at: '2026-09-01T00:00:00Z' },
    { id: 'c', severity: 'medium', status: 'open', created_at: '2026-10-01T00:00:00Z' },
    { id: 'd', severity: 'medium', status: 'open', created_at: '2026-10-03T00:00:00Z' },
    { id: 'e', severity: 'critical', status: 'resolved', created_at: '2026-10-06T00:00:00Z' },
    { id: 'f', severity: 'critical', status: 'in_progress', created_at: '2026-08-01T00:00:00Z' },
  ]
  assert.deepEqual(sortBugs(bugs).map((b) => b.id), ['f', 'b', 'd', 'c', 'a', 'e'])
})
