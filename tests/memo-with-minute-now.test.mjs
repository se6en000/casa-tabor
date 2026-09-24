import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { memoWithMinuteNow } from '../src/utils/memoWithMinuteNow.ts'

// 2026-09-24: part of the kiosk scroll-jank investigation (see
// casa_tabor_pi_ux_lag_investigation memory). Disabling Hero's drag gesture
// and EventCard's layout-tracking each measurably helped ("50% better", then
// "better still", both user-confirmed). This is the next candidate: `now`
// comes from useLiveClock(10_000) at the top of CalmKioskView and is threaded
// down as a prop to most homepage widgets, so it's a fresh Date reference
// every 10 seconds -- which defeats a plain React.memo() shallow-prop-compare
// every single tick, forcing a full re-render of that widget (and everything
// under it) 6x more often than actually needed, since nothing these widgets
// render is more precise than whole minutes.

function Noop() { return null }

test('memoWithMinuteNow treats now as equal within the same minute', () => {
  const Wrapped = memoWithMinuteNow(Noop)
  const a = { now: new Date('2026-09-24T18:11:05.000Z'), title: 'x' }
  const b = { now: new Date('2026-09-24T18:11:55.000Z'), title: 'x' }
  assert.equal(Wrapped.compare(a, b), true, 'same minute, same other props -> should bail out (treated equal)')
})

test('memoWithMinuteNow treats now as different once the minute rolls over', () => {
  const Wrapped = memoWithMinuteNow(Noop)
  const a = { now: new Date('2026-09-24T18:11:59.000Z'), title: 'x' }
  const b = { now: new Date('2026-09-24T18:12:00.000Z'), title: 'x' }
  assert.equal(Wrapped.compare(a, b), false, 'minute boundary crossed -> should re-render')
})

test('memoWithMinuteNow still re-renders when a real (non-now) prop changes', () => {
  const Wrapped = memoWithMinuteNow(Noop)
  const a = { now: new Date('2026-09-24T18:11:05.000Z'), title: 'x' }
  const b = { now: new Date('2026-09-24T18:11:55.000Z'), title: 'y' }
  assert.equal(Wrapped.compare(a, b), false, 'a real prop changed -- must not be swallowed by the now special-case')
})

test('memoWithMinuteNow falls back to reference equality when now is absent on either side', () => {
  const Wrapped = memoWithMinuteNow(Noop)
  const a = { now: undefined, title: 'x' }
  const b = { now: undefined, title: 'x' }
  assert.equal(Wrapped.compare(a, b), true)
  const c = { now: new Date(), title: 'x' }
  assert.equal(Wrapped.compare(a, c), false)
})

// Every homepage widget that takes `now` as a prop should be wrapped in this
// (or, for the couple that never took `now` at all -- HouseholdDispatchCard --
// a plain memo() remains correct and is left alone).
for (const [label, path] of [
  ['TodaysScheduleWidget', 'src/components/canvas/widgets/TodaysScheduleWidget.tsx'],
  ['TodaysTodosWidget', 'src/components/canvas/widgets/TodaysTodosWidget.tsx'],
  ['TomorrowPreviewWidget', 'src/components/canvas/widgets/TomorrowPreviewWidget.tsx'],
  ['MiddayLogisticsWidget', 'src/components/canvas/widgets/MiddayLogisticsWidget.tsx'],
  ['ImminentTransitWidget', 'src/components/canvas/widgets/ImminentTransitWidget.tsx'],
  ['MorningLaunchpadWidget', 'src/components/canvas/widgets/MorningLaunchpadWidget.tsx'],
  ['TomorrowPrepWidget', 'src/components/canvas/widgets/TomorrowPrepWidget.tsx'],
  ['HeroFlybyCard', 'src/components/canvas/widgets/HeroFlybyCard.tsx'],
]) {
  test(`${label} is wrapped with memoWithMinuteNow`, () => {
    const src = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    assert.match(src, /import \{ memoWithMinuteNow \} from '.*utils\/memoWithMinuteNow'/)
    const exportMatch = src.match(new RegExp(`export default memoWithMinuteNow\\(${label}\\)`))
    assert.ok(exportMatch, `expected "export default memoWithMinuteNow(${label})"`)
    // The component itself must no longer be a default export directly.
    assert.doesNotMatch(src, new RegExp(`export default function ${label}\\(`))
  })
}
