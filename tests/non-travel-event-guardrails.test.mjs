import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  classifyTransportationDefault,
  buildGeneratedTransportationPlan,
} from '../supabase/functions/_shared/event-transportation-defaults.mjs'

import {
  inferEventMode,
  inferEventPlanKind,
} from '../src/lib/eventCommandCenter.ts'

const calmKioskViewSource = readFileSync(
  new URL('../src/components/canvas/CalmKioskView.tsx', import.meta.url),
  'utf8',
)
const presenterSource = readFileSync(
  new URL('../src/hooks/useCalmKioskPresenter.ts', import.meta.url),
  'utf8',
)
const mobileSource = readFileSync(
  new URL('../src/components/mobile/MobileTodayView.tsx', import.meta.url),
  'utf8',
)

test('online order submissions with descriptions are classified as remote with no transportation plan', () => {
  const onlineOrderEvent = {
    id: 'walmart-order-1',
    title: 'Submit Walmart Order',
    description: 'Ensure all necessary order details are ready for submission. This is an online order submission, so no physical items needed.',
    start_time: '2026-08-15T09:30:00-04:00',
    end_time: '2026-08-15T09:45:00-04:00',
    all_day: false,
    location_name: 'Walmart',
    address: '',
    category: 'task',
  }

  const classification = classifyTransportationDefault(onlineOrderEvent)
  assert.equal(classification.kind, 'none')
  assert.equal(classification.reason, 'remote')

  const planResult = buildGeneratedTransportationPlan({
    event: onlineOrderEvent,
    homeAddress: '1 Casa Way',
    members: [],
    householdMembers: [],
  })
  assert.equal(planResult.plan, null)
})

test('eventCommandCenter infers hosted mode and remote kind for online tasks and at-home items', () => {
  const onlineOrderEvent = {
    id: 'walmart-order-1',
    title: 'Submit Walmart Order',
    description: 'This is an online order submission, so no physical items need...',
    start_time: '2026-08-15T09:30:00-04:00',
    end_time: '2026-08-15T09:45:00-04:00',
    all_day: false,
    location_name: 'Walmart',
    address: '',
    enrichment: { category: 'task' },
  }

  const mode = inferEventMode(onlineOrderEvent)
  assert.equal(mode, 'hosted')

  const kind = inferEventPlanKind(onlineOrderEvent, mode)
  assert.equal(kind, 'remote')
})

test('CalmKioskView and useCalmKioskPresenter strictly gate travel UI and progress bars with isTravelEvent', () => {
  assert.match(presenterSource, /const mode = inferEventMode\(nextEvent\)/)
  assert.match(presenterSource, /const kind = inferEventPlanKind\(nextEvent, mode\)/)
  assert.match(presenterSource, /if \(kind !== 'travel'\) return false/)
  assert.match(calmKioskViewSource, /driveTimeMins=\{isTravelEvent \? driveTimeMins : null\}/)
  assert.match(calmKioskViewSource, /leaveAt=\{isTravelEvent \? leaveAt : null\}/)
  assert.match(calmKioskViewSource, /\{isTravelEvent && \(nextEvent\.address \|\| nextEvent\.location_name\) && \(/)
  assert.match(mobileSource, /isHeroTravel/)
})
