import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  calculateOrderOrPrepWindow,
  getDinnerPlanSuggestions,
  matchDinnerPlanIntent,
} from '../src/utils/dinnerPlanManager.ts'

const defaultCookPlan = {
  mode: 'cook',
  title: 'Herb-Roasted Chicken & Warm Farro',
  subtitle: '35m prep · Pantry stock confirmed · Chef: Sarah & Luke',
  targetTime: '6:30 PM Target',
  chefOrDriver: 'Sarah & Luke',
  statusBadge: 'Ingredients ready',
}

const flanigansPlan = {
  mode: 'takeout',
  title: "Flanigan's Seafood Bar & Grill",
  subtitle: 'Pickup: Luke (on route) · Order window: 5:45 PM–6:00 PM',
  targetTime: '6:30 PM Target',
  chefOrDriver: 'Luke',
  statusBadge: 'Order pending',
}

test('calculateOrderOrPrepWindow: calculates realistic order window for takeout', () => {
  const result630 = calculateOrderOrPrepWindow('takeout', '6:30 PM Target', 'Luke')
  assert.equal(result630.statusBadge, 'Order pending')
  assert.match(result630.subtitle, /5:45 PM–6:00 PM/)
  assert.match(result630.subtitle, /Pickup: Luke/)

  const result700 = calculateOrderOrPrepWindow('takeout', '7:00 PM Target', 'Luke')
  assert.equal(result700.statusBadge, 'Order pending')
  assert.match(result700.subtitle, /6:15 PM–6:30 PM/)
})

test('calculateOrderOrPrepWindow: sets realistic status for cook, leftovers, and dineout', () => {
  const cook = calculateOrderOrPrepWindow('cook', '6:30 PM Target', 'Sarah')
  assert.equal(cook.statusBadge, 'Ingredients ready')
  assert.match(cook.subtitle, /Chef: Sarah/)

  const leftovers = calculateOrderOrPrepWindow('leftovers', '6:15 PM Target')
  assert.equal(leftovers.statusBadge, 'In fridge ready to heat')

  const dineout = calculateOrderOrPrepWindow('dineout', '7:00 PM Target')
  assert.equal(dineout.statusBadge, 'Table open')
  assert.match(dineout.subtitle, /Depart by 6:30 PM/)
})

test('matchDinnerPlanIntent: matches Flanigans takeout request with pending order status', () => {
  const match = matchDinnerPlanIntent(
    'can we update the dinner plans tonight to getting food from Flanigans?',
    defaultCookPlan,
  )
  assert.ok(match)
  assert.ok(match.toolAction)
  assert.equal(match.toolAction.tool, 'update_dinner_plan')
  assert.equal(match.toolAction.args.mode, 'takeout')
  assert.equal(match.toolAction.args.title, "Flanigan's Seafood Bar & Grill")
  assert.equal(match.toolAction.args.statusBadge, 'Order pending')
  assert.match(match.toolAction.args.subtitle, /Order window: 5:45 PM–6:00 PM/)
  assert.match(match.assistantReply, /Flanigan's Seafood Bar & Grill/)
})

test('matchDinnerPlanIntent: pushing time to 7:00 PM recalculates order window accurately', () => {
  const pushMatch = matchDinnerPlanIntent('Push dinner to 7:00 PM', flanigansPlan)
  assert.ok(pushMatch)
  assert.ok(pushMatch.toolAction)
  assert.equal(pushMatch.toolAction.args.targetTime, '7:00 PM Target')
  assert.match(pushMatch.toolAction.args.subtitle, /6:15 PM–6:30 PM/)
  assert.match(pushMatch.assistantReply, /7:00 PM/)
})

test('matchDinnerPlanIntent: reassigns driver to Sarah', () => {
  const match = matchDinnerPlanIntent('Sarah is picking up', flanigansPlan)
  assert.ok(match)
  assert.ok(match.toolAction)
  assert.equal(match.toolAction.args.chefOrDriver, 'Sarah')
  assert.match(match.toolAction.args.subtitle, /Pickup: Sarah/)
})

test('matchDinnerPlanIntent: advances status when order is placed', () => {
  const match = matchDinnerPlanIntent('We placed the order', flanigansPlan)
  assert.ok(match)
  assert.ok(match.toolAction)
  assert.match(match.toolAction.args.statusBadge, /Order placed/)
})

test('getDinnerPlanSuggestions: contextually adapts chips based on current plan', () => {
  const cookSuggestions = getDinnerPlanSuggestions(defaultCookPlan)
  assert.ok(cookSuggestions.includes("🥡 Takeout from Flanigan's"))
  assert.ok(cookSuggestions.includes('🍕 Pizza Night'))
  assert.ok(cookSuggestions.includes('🍲 Reheat Leftovers'))

  const flanigansSuggestions = getDinnerPlanSuggestions(flanigansPlan)
  assert.ok(flanigansSuggestions.includes('⏰ Push dinner to 7:00 PM'))
  assert.ok(flanigansSuggestions.includes('🚗 Sarah picking up'))
  assert.ok(flanigansSuggestions.includes('📞 Order placed'))
  assert.ok(flanigansSuggestions.includes('🍳 Switch to Cooking'))

  // Once at 7:00 PM, push suggestion advances to 7:30 PM
  const at7pmPlan = { ...flanigansPlan, targetTime: '7:00 PM Target' }
  const at7pmSuggestions = getDinnerPlanSuggestions(at7pmPlan)
  assert.ok(at7pmSuggestions.includes('⏰ Push dinner to 7:30 PM'))
  assert.ok(!at7pmSuggestions.includes('⏰ Push dinner to 7:00 PM'))
})

test('code integrity: CalmKioskView and AIChatDrawer adhere to UX and handoff contracts', async () => {
  const kioskSource = await readFile(
    new URL('../src/components/canvas/CalmKioskView.tsx', import.meta.url),
    'utf8',
  )
  const drawerSource = await readFile(
    new URL('../src/components/shared/AIChatDrawer.tsx', import.meta.url),
    'utf8',
  )

  // CalmKioskView has subtle Change action with 44px min-height target
  assert.match(kioskSource, /open-ai-chat/)
  assert.match(kioskSource, /source:\s*'tonights-kitchen'/)
  assert.match(kioskSource, /min-h-\[44px\]/)
  assert.match(kioskSource, /dinnerPlan\.title/)

  // AIChatDrawer connects with dinner plan intent and updates
  assert.match(drawerSource, /update_dinner_plan/)
  assert.match(drawerSource, /tonights-kitchen/)
})
