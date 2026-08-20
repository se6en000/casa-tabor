import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import {
  isValidDinnerPlan,
  normalizeDinnerPlan,
  DINNER_PLAN_SETTINGS_KEY,
  DINNER_PLAN_STORAGE_KEY,
  DINNER_PLAN_REALTIME_CHANNEL,
  DINNER_PLAN_BROADCAST_EVENT,
  DINNER_PLAN_DOM_EVENT,
} from '../src/utils/dinnerPlanSync.ts'

import { DEFAULT_DINNER_PLAN, useAppStore } from '../src/stores/appStore.ts'

test('isValidDinnerPlan: validates correct dinner plans and rejects invalid structures', () => {
  assert.equal(
    isValidDinnerPlan({
      mode: 'cook',
      title: 'Herb-Roasted Chicken',
      subtitle: '35m prep',
      targetTime: '6:30 PM Target',
    }),
    true
  )

  assert.equal(
    isValidDinnerPlan({
      mode: 'takeout',
      title: "Flanigan's",
      subtitle: 'Pickup: Luke',
      targetTime: '7:00 PM Target',
    }),
    true
  )

  assert.equal(
    isValidDinnerPlan({
      mode: 'leftovers',
      title: 'Reheat Pasta & Salad',
      subtitle: '10m reheat',
      targetTime: '6:30 PM Target',
    }),
    true
  )

  assert.equal(
    isValidDinnerPlan({
      mode: 'dineout',
      title: 'Palm Beach Grill',
      subtitle: 'Depart 6:30 PM',
      targetTime: '7:00 PM Target',
    }),
    true
  )

  // Invalid: missing title
  assert.equal(
    isValidDinnerPlan({
      mode: 'cook',
      title: '   ',
    }),
    false
  )

  // Invalid: bad mode
  assert.equal(
    isValidDinnerPlan({
      mode: 'delivery-drone',
      title: 'Pizza',
    }),
    false
  )

  // Invalid: null / primitives
  assert.equal(isValidDinnerPlan(null), false)
  assert.equal(isValidDinnerPlan(undefined), false)
  assert.equal(isValidDinnerPlan('pizza'), false)
})

test('normalizeDinnerPlan: normalizes raw DB / JSON payload gracefully', () => {
  const normalized = normalizeDinnerPlan({
    mode: 'takeout',
    title: '  Pizza Night  ',
    subtitle: 'Ordered from Luigi',
    targetTime: '7:15 PM Target',
  })

  assert.ok(normalized)
  assert.equal(normalized.mode, 'takeout')
  assert.equal(normalized.title, 'Pizza Night')
  assert.equal(normalized.subtitle, 'Ordered from Luigi')
  assert.equal(normalized.targetTime, '7:15 PM Target')
  assert.ok(normalized.updatedAt)
})

test('constants: uses canonical keys and channel names', () => {
  assert.equal(DINNER_PLAN_SETTINGS_KEY, 'tonight_kitchen_plan')
  assert.equal(DINNER_PLAN_STORAGE_KEY, 'casa-tonight-kitchen-plan')
  assert.equal(DINNER_PLAN_REALTIME_CHANNEL, 'casa-tonight-dinner-sync')
  assert.equal(DINNER_PLAN_BROADCAST_EVENT, 'dinner-plan-updated')
  assert.equal(DINNER_PLAN_DOM_EVENT, 'casa:dinner-plan-updated')
})

test('store integration: setDinnerPlan updates store and retains contract', () => {
  const customPlan = {
    mode: 'takeout',
    title: "Flanigan's Seafood Bar & Grill",
    subtitle: 'Pickup: Luke · Window: 6:00–6:15 PM',
    targetTime: '6:30 PM Target',
    chefOrDriver: 'Luke',
    statusBadge: 'Order pending',
  }

  // Update store (with localOnly so tests don't require network)
  useAppStore.getState().setDinnerPlan(customPlan, { localOnly: true })
  const stored = useAppStore.getState().dinnerPlan

  assert.equal(stored.title, "Flanigan's Seafood Bar & Grill")
  assert.equal(stored.mode, 'takeout')
  assert.equal(stored.targetTime, '6:30 PM Target')
  assert.equal(stored.chefOrDriver, 'Luke')

  // Reset store
  useAppStore.getState().resetDinnerPlan({ localOnly: true })
  const reset = useAppStore.getState().dinnerPlan
  assert.equal(reset.title, DEFAULT_DINNER_PLAN.title)
  assert.equal(reset.mode, DEFAULT_DINNER_PLAN.mode)
})

test('code wiring: AppShell mounts useTonightDinnerSync', async () => {
  const appSource = await readFile(
    new URL('../src/App.tsx', import.meta.url),
    'utf8'
  )
  assert.match(appSource, /useTonightDinnerSync/)
  assert.match(appSource, /useTonightDinnerSync\(\)/)
})

test('code wiring: appStore integrates saveTonightDinnerPlan', async () => {
  const storeSource = await readFile(
    new URL('../src/stores/appStore.ts', import.meta.url),
    'utf8'
  )
  assert.match(storeSource, /saveTonightDinnerPlan/)
  assert.match(storeSource, /normalizeDinnerPlan/)
})
