import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Bug (2026-09-23, found while digging into a Playwright failure that turned
// out not to be about the failing test at all): on every fresh page load --
// confirmed live with Playwright's clock pinned to a real departure window,
// checking the DOM at t=0 right after page.goto -- CalmKioskView renders a
// fully-confident "Afternoon Logistics Clear / All daily household routines
// and tasks are complete" empty state (MiddayLogisticsWidget) BEFORE the
// real events query has resolved, because useCalmKioskPresenter discards
// useTodayEvents()'s isPending flag (`const { data: todayEvents = [] } =
// useTodayEvents(now)`) and an empty array during loading is indistinguishable
// from a genuinely empty day. For the app's single highest-stakes card --
// "when do I need to leave" -- that's a false "you're clear" flash, not a
// mere loading blip. (In real kiosk usage the persisted stale-while-revalidate
// cache from casa_tabor_event_create_latency_todo usually masks this; a cold
// context -- first boot, cleared cache, aged-out persistence -- still hits it.)
//
// Fix: thread isPending through useCalmKioskPresenter and gate CalmKioskView's
// Hero/schedule content on it, showing a Skeleton instead of a confident
// empty state while the initial fetch is still in flight.

const presenterContent = fs.readFileSync(path.resolve('src/hooks/useCalmKioskPresenter.ts'), 'utf8')
const viewContent = fs.readFileSync(path.resolve('src/components/canvas/CalmKioskView.tsx'), 'utf8')

test('useCalmKioskPresenter captures and exposes isPending from useTodayEvents, not just data', () => {
  assert.match(
    presenterContent,
    /const\s*{\s*data:\s*todayEvents\s*=\s*\[\]\s*,\s*isPending:\s*isTodayEventsPending\s*}\s*=\s*useTodayEvents\(now\)/,
    'useTodayEvents() already exposes isPending (spread from the underlying useQuery result via useRollingEvents) -- capture it instead of discarding everything but data',
  )
  assert.match(
    presenterContent,
    /isTodayEventsPending/,
    'the captured flag must actually be returned from the hook for CalmKioskView to gate on',
  )
})

test('CalmKioskView shows a loading skeleton instead of the confident empty-day content while the initial events fetch is still pending', () => {
  assert.match(
    viewContent,
    /isTodayEventsPending/,
    'CalmKioskView must read the pending flag from the presenter',
  )
  assert.match(
    viewContent,
    /<Skeleton/,
    'while pending, render the shared Skeleton primitive instead of mounting Hero/schedule widgets that assume an empty array means an empty day',
  )
})
