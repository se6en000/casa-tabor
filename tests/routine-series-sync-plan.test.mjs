import test from 'node:test'
import assert from 'node:assert/strict'
import { planRoutineSeriesSync, runRoutineSyncOnce } from '../src/lib/routineRecurrenceCoordinator.ts'

// Found 2026-09-27: Emme's Thursday school runs existed as 2 drop-off and 3 pick-up series in Google
// (created within 4 seconds on Sep 14), each held twice in Casa, plus a pick-up under an older label.
// Saving a routine ran the sync without waiting, so overlapping saves each saw "nothing yet" and
// created it; the existence check skipped imported series (their templates are status 'cancelled'),
// and Casa's own pushes were adopted a second time by the importer.

const desired = [
  { key: 'd-tu', title: 'Drop off Emme @ PBPE · Early Beethoven Strings', dayCode: 'TU' },
  { key: 'd-th', title: 'Drop off Emme @ PBPE · Late Strings Pickup', dayCode: 'TH' },
  { key: 'p-th', title: 'Pick up Emme @ PBPE · Late Strings Pickup', dayCode: 'TH' },
]
const s = (id, title, day, gid, ownership, created) => ({ seriesId: id, title, byDay: day, gid, ownership, createdAt: created, templateGoogleId: ownership === 'casa' ? gid : null })

test('one series is kept per wanted school run; the rest retire, and a Google copy is deleted only if nothing kept uses it', () => {
  const existing = [
    s('tu-adopted', 'Drop off Emme @ PBPE · Early Beethoven Strings', 'TU', 'g-tu', 'google_adopted', '2026-08-20'),
    s('dth-casa-1', 'Drop off Emme @ PBPE · Late Strings Pickup', 'TH', 'g-d1', 'casa', '2026-09-14'),
    s('dth-casa-2', 'Drop off Emme @ PBPE · Late Strings Pickup', 'TH', 'g-d2', 'casa', '2026-09-14'),
    s('dth-adopt-1', 'Drop off Emme @ PBPE · Late Strings Pickup', 'TH', 'g-d1', 'google_adopted', '2026-09-15'),
    s('dth-adopt-2', 'Drop off Emme @ PBPE · Late Strings Pickup', 'TH', 'g-d2', 'google_adopted', '2026-09-15'),
    s('pth-casa-1', 'Pick up Emme @ PBPE · Late Strings Pickup', 'TH', 'g-p1', 'casa', '2026-09-14'),
    s('pth-adopt-1', 'Pick up Emme @ PBPE · Late Strings Pickup', 'TH', 'g-p1', 'google_adopted', '2026-09-15'),
    s('pth-adopt-2', 'Pick up Emme @ PBPE · Late Strings Pickup', 'TH', 'g-p2', 'google_adopted', '2026-09-15'),
    s('pth-old-label', 'Pick up Emme @ PBPE · Late Strings Program', 'TH', 'g-old', 'google_adopted', '2026-08-20'),
  ]
  const plan = planRoutineSeriesSync(desired, existing)
  assert.deepEqual(plan.keep.map((k) => k.seriesId).sort(), ['dth-adopt-1', 'pth-adopt-1', 'tu-adopted'])
  assert.deepEqual(plan.create, [])
  const retire = Object.fromEntries(plan.retire.map((r) => [r.seriesId, r.deleteGoogle]))
  assert.deepEqual(retire, {
    'dth-casa-1': false, // same Google series as the kept one
    'dth-casa-2': true, // it knows the Google id, so it does the delete
    'dth-adopt-2': false, // same Google copy — deleted once
    'pth-casa-1': false,
    'pth-adopt-2': true,
    'pth-old-label': true, // no longer wanted (the label changed)
  })
  const deletes = plan.retire.filter((r) => r.deleteGoogle).map((r) => r.gid)
  assert.equal(new Set(deletes).size, deletes.length, 'each Google copy is deleted once')
})

test('a wanted school run with no series is created; an imported series counts as existing', () => {
  const plan = planRoutineSeriesSync(desired, [s('tu', desired[0].title, 'TU', 'g-tu', 'google_adopted', '2026-08-20')])
  assert.deepEqual(plan.create.map((d) => d.key), ['d-th', 'p-th'])
  assert.deepEqual(plan.retire, [])
})

test('syncs for the same child run one at a time', async () => {
  const log = []
  const slow = (n) => async () => { log.push(`start ${n}`); await new Promise((r) => setTimeout(r, 20)); log.push(`end ${n}`); return n }
  const results = await Promise.all([runRoutineSyncOnce('emme', slow(1)), runRoutineSyncOnce('emme', slow(2))])
  assert.deepEqual(results, [1, 2])
  assert.deepEqual(log, ['start 1', 'end 1', 'start 2', 'end 2'])
})
