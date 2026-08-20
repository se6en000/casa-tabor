import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  buildEventTransportationPlanForMode,
  applyLogisticsModeToPlan,
} from '../src/lib/eventTransportation.ts'

test('Living Flow Routine Driver Persistence: single-leg pickup plan preserves pickup driver', () => {
  const dummyEvent = {
    id: 'test-event-1',
    title: 'Emme Strings @ PBP (Late Pickup)',
    start_time: '2026-09-03T15:00:00.000Z',
    end_time: '2026-09-03T15:15:00.000Z',
    location_name: 'Palm Beach Public Elementary School',
    address: '239 Cocoanut Row, Palm Beach, FL 33480',
    members: [
      { id: 'mem-1', role: 'passenger', family_member: { id: 'emme-id', name: 'Emme' } },
    ],
  }
  const homeAddress = '3209 Washington Road, West Palm Beach, FL'

  // Build pickup_only plan with Giselle as driver2
  const plan = buildEventTransportationPlanForMode(
    dummyEvent,
    homeAddress,
    'pickup_only',
    {
      driver1: { id: 'jake-id', name: 'Jake' },
      driver2: { id: 'giselle-id', name: 'Giselle' },
    },
  )

  assert.equal(plan.legs.length, 1)
  assert.equal(plan.legs[0].purpose, 'pickup')
  assert.equal(plan.legs[0].driverName, 'Giselle')
  assert.equal(plan.legs[0].driverId, 'giselle-id')

  // Applying logistics mode transitions should preserve Giselle when re-evaluating
  const reapplied = applyLogisticsModeToPlan(plan, 'pickup_only', dummyEvent, homeAddress)
  assert.equal(reapplied.legs.length, 1)
  assert.equal(reapplied.legs[0].driverName, 'Giselle')
})

test('Living Flow Routine Driver Persistence: useLivingFlowState and materializeSyntheticRoutineEvent code contracts', async () => {
  const root = process.cwd()
  const useLivingFlowStateSrc = await fs.readFile(
    path.join(root, 'src/components/calendar/living-flow/hooks/useLivingFlowState.ts'),
    'utf-8'
  )
  const eventMutationsSrc = await fs.readFile(
    path.join(root, 'src/lib/eventMutations.ts'),
    'utf-8'
  )

  // 1. persistDriverAndTravel must handle routine- prefix and call materializeSyntheticRoutineEvent
  assert.match(
    useLivingFlowStateSrc,
    /if\s*\(\s*currentEvent\.id\.startsWith\('routine-'\)\s*\)\s*\{[\s\S]*materializeSyntheticRoutineEvent/,
    'persistDriverAndTravel must materialize synthetic routine events before saving plan overrides'
  )

  // 2. persistDriverAndTravel must update selectedSidecarEventId in appStore
  assert.match(
    useLivingFlowStateSrc,
    /useAppStore\.getState\(\)\.setSelectedSidecarEventId\(materialized\.id\)/,
    'persistDriverAndTravel must update sidecar selection to the new materialized event id'
  )

  // 3. materializeSyntheticRoutineEvent must accept driverLeg1, driverLeg2, and travelBehavior
  assert.match(
    eventMutationsSrc,
    /driverLeg1\?: string/,
    'materializeSyntheticRoutineEvent must accept driverLeg1 override'
  )
  assert.match(
    eventMutationsSrc,
    /driverLeg2\?: string/,
    'materializeSyntheticRoutineEvent must accept driverLeg2 override'
  )
  assert.match(
    eventMutationsSrc,
    /travelBehavior\?: TravelBehavior/,
    'materializeSyntheticRoutineEvent must accept travelBehavior override'
  )

  // 4. materializeSyntheticRoutineEvent must persist plan override and driver members
  assert.match(
    eventMutationsSrc,
    /saveEventTransportationOverride/,
    'materializeSyntheticRoutineEvent must save transportation plan override'
  )
})
