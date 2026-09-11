import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// Replaces the old single-run-on-sentence "Evening Digest" (see the removed
// dailyBriefing/milestonePhrases/upcomingMilestonesAndPrep contract this file
// used to assert) with a structured Household Dispatch: a "This Week" ribbon
// (signal-filtered, day 0-6) plus a "On the Horizon" milestone ledger (day
// 7-30), replacing prose with something actually scannable. Design concept
// approved by the user 2026-09-11 before this was built.

test('useCalmKioskPresenter exports the Household Dispatch contract: headline, week ribbon, and 30-day horizon', async () => {
  const presenterSource = await readFile(
    new URL('../src/hooks/useCalmKioskPresenter.ts', import.meta.url),
    'utf8'
  )

  assert.match(presenterSource, /dispatchHeadline:\s*string/)
  assert.match(presenterSource, /dispatchWeekDays:\s*DispatchDay\[\]/)
  assert.match(presenterSource, /dispatchHorizon:\s*DispatchHorizonItem\[\]/)
  assert.match(presenterSource, /isRefreshing:\s*boolean/)
  assert.match(presenterSource, /refreshBriefing:\s*\(\)\s*=>\s*Promise<void>/)
  assert.match(presenterSource, /refreshBriefing = useCallback/)
  assert.match(presenterSource, /queryClient\.invalidateQueries/)

  // The old prose contract must actually be gone, not just supplemented --
  // otherwise this is dead code sitting alongside the new structure.
  assert.doesNotMatch(presenterSource, /dailyBriefing/)
  assert.doesNotMatch(presenterSource, /On the radar:/)
})

test('the week ribbon only dots days with real signal, not every routine event', () => {
  // (checked via source, since this is pure per-day filtering logic)
  return readFile(new URL('../src/hooks/useCalmKioskPresenter.ts', import.meta.url), 'utf8').then((presenterSource) => {
    assert.match(presenterSource, /function isDispatchNotable/)
    assert.match(presenterSource, /function isDispatchMilestone/)
    // Week ribbon spans today through +6 days (7 stubs).
    assert.match(presenterSource, /Array\.from\(\{ length: 7 \}/)
  })
})

test('the horizon ledger is milestone-grade only (celebrations/trips), 7-30 days out, capped so it stays a glance', async () => {
  const presenterSource = await readFile(new URL('../src/hooks/useCalmKioskPresenter.ts', import.meta.url), 'utf8')
  assert.match(presenterSource, /if \(daysAway < 7 \|\| daysAway > 30\) return false/)
  assert.match(presenterSource, /return isDispatchMilestone\(e\)/)
  assert.match(presenterSource, /\.slice\(0, 4\)/)
})

test('event categories collapse into the small dispatch bucket set (sports/school/social/travel/other), reusing the real event_enrichments taxonomy', async () => {
  const presenterSource = await readFile(new URL('../src/hooks/useCalmKioskPresenter.ts', import.meta.url), 'utf8')
  assert.match(presenterSource, /export type DispatchBucket = 'sports' \| 'school' \| 'social' \| 'travel' \| 'other'/)
  assert.match(presenterSource, /if \(cat === 'school' \|\| cat === 'child_care'\) return 'school'/)
  assert.match(presenterSource, /if \(cat === 'social' \|\| cat === 'birthday' \|\| cat === 'holiday'\) return 'social'/)
  assert.match(presenterSource, /import { CATEGORY_LABEL } from '\.\.\/components\/calendar\/categoryFields'/)
})

test('HouseholdDispatchCard renders the week ribbon and horizon ledger, and only uses real design tokens', async () => {
  const cardSource = await readFile(
    new URL('../src/components/canvas/widgets/HouseholdDispatchCard.tsx', import.meta.url),
    'utf8'
  )
  assert.match(cardSource, /This Week/)
  assert.match(cardSource, /On the Horizon/)
  assert.match(cardSource, /aria-label="Refresh daily brief"/)
  // casa-gold-hover / casa-gold-soft are not real tokens anywhere in this
  // design system (verified against src/generated/design-tokens.css) -- a
  // couple of older components reference them as a latent no-op bug; this
  // new component must not repeat that mistake.
  assert.doesNotMatch(cardSource, /casa-gold-hover/)
  assert.doesNotMatch(cardSource, /casa-gold-soft/)
})

test('CalmKioskView renders HouseholdDispatchCard instead of the old inline prose block', async () => {
  const kioskSource = await readFile(
    new URL('../src/components/canvas/CalmKioskView.tsx', import.meta.url),
    'utf8'
  )
  assert.match(kioskSource, /import HouseholdDispatchCard from '\.\/widgets\/HouseholdDispatchCard'/)
  assert.match(kioskSource, /<HouseholdDispatchCard/)
  assert.doesNotMatch(kioskSource, /dailyBriefing/)
})
