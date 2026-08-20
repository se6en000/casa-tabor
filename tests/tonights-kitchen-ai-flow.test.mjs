import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  calculateOrderOrPrepWindow,
  getDinnerPlanSuggestions,
  matchDinnerPlanIntent,
  FEATURED_RECIPES,
} from '../src/utils/dinnerPlanManager.ts'

const defaultCookPlan = {
  mode: 'cook',
  title: 'Garlic Butter Shrimp Scampi',
  subtitle: '30m prep · Pantry stock confirmed · Chef: Jake & Kelly',
  targetTime: '6:30 PM Target',
  recipeId: '8cfa3cd2-a68f-4b73-912f-92865ba1ee6a',
  chefOrDriver: 'Jake & Kelly',
  statusBadge: 'Ingredients ready',
}

const flanigansPlan = {
  mode: 'takeout',
  title: "Flanigan's Seafood Bar & Grill",
  subtitle: 'Pickup: Jake (on route) · Order window: 5:45 PM–6:00 PM',
  targetTime: '6:30 PM Target',
  chefOrDriver: 'Jake',
  statusBadge: 'Order pending',
}

test('calculateOrderOrPrepWindow: calculates realistic order window for takeout', () => {
  const result630 = calculateOrderOrPrepWindow('takeout', '6:30 PM Target', 'Jake')
  assert.equal(result630.statusBadge, 'Order pending')
  assert.match(result630.subtitle, /5:45 PM–6:00 PM/)
  assert.match(result630.subtitle, /Pickup: Jake/)

  const result700 = calculateOrderOrPrepWindow('takeout', '7:00 PM Target', 'Jake')
  assert.equal(result700.statusBadge, 'Order pending')
  assert.match(result700.subtitle, /6:15 PM–6:30 PM/)
})

test('calculateOrderOrPrepWindow: sets realistic status for cook, leftovers, and dineout', () => {
  const cook = calculateOrderOrPrepWindow('cook', '6:30 PM Target', 'Jake & Kelly')
  assert.equal(cook.statusBadge, 'Ingredients ready')
  assert.match(cook.subtitle, /Chef: Jake & Kelly/)

  const leftovers = calculateOrderOrPrepWindow('leftovers', '6:15 PM Target')
  assert.equal(leftovers.statusBadge, 'In fridge ready to heat')

  const dineout = calculateOrderOrPrepWindow('dineout', '7:00 PM Target')
  assert.equal(dineout.statusBadge, 'Table open')
  assert.match(dineout.subtitle, /Depart by 6:30 PM/)
})

test('matchDinnerPlanIntent: "Swap saved recipe" prompts user with numbered recipe options', () => {
  const match = matchDinnerPlanIntent('Swap saved recipe', defaultCookPlan)
  assert.ok(match)
  assert.equal(match.toolAction, undefined)
  assert.match(match.assistantReply, /1\. \*\*Garlic Butter Shrimp Scampi\*\*/)
  assert.match(match.assistantReply, /2\. \*\*GLP-1 Friendly Garlicky Shrimp Couscous Bowls\*\*/)
  assert.match(match.assistantReply, /3\. \*\*Protein Pasta A La Vodka Sauce\*\*/)
  assert.match(match.assistantReply, /4\. \*\*One-Pan Bang Bang Salmon Potato Bake\*\*/)
})

test('matchDinnerPlanIntent: conversational option 4 ("lets go with 4") prepares switch to salmon potato bake', () => {
  const phrases = [
    'lets go with 4',
    "let's go with 4",
    'go with 4',
    'option 4',
    'number 4',
    '4',
    '#4',
    'the fourth one',
    'lets do 4',
  ]

  for (const phrase of phrases) {
    const match = matchDinnerPlanIntent(phrase, defaultCookPlan)
    assert.ok(match, `Expected match for phrase: "${phrase}"`)
    assert.ok(match.toolAction, `Expected toolAction for phrase: "${phrase}"`)
    assert.equal(match.toolAction.tool, 'update_dinner_plan')
    assert.equal(match.toolAction.args.mode, 'cook')
    assert.equal(match.toolAction.args.title, 'One-Pan Bang Bang Salmon Potato Bake')
    assert.equal(match.toolAction.args.recipeId, '40444761-e044-4b8d-8bf9-96ee7b7d8266')
    assert.match(match.assistantReply, /One-Pan Bang Bang Salmon Potato Bake/)
  }
})

test('matchDinnerPlanIntent: conversational option 1 ("lets go with 1" or "shrimp scampi") prepares switch to shrimp scampi', () => {
  const match = matchDinnerPlanIntent('lets go with 1', defaultCookPlan)
  assert.ok(match)
  assert.equal(match.toolAction?.args.title, 'Garlic Butter Shrimp Scampi')
  assert.equal(match.toolAction?.args.recipeId, '8cfa3cd2-a68f-4b73-912f-92865ba1ee6a')

  const matchKw = matchDinnerPlanIntent('make shrimp scampi', defaultCookPlan)
  assert.ok(matchKw)
  assert.equal(matchKw.toolAction?.args.title, 'Garlic Butter Shrimp Scampi')
})

test('matchDinnerPlanIntent: conversational option 2 ("couscous") prepares switch to couscous bowls', () => {
  const match = matchDinnerPlanIntent('lets do option 2', defaultCookPlan)
  assert.ok(match)
  assert.equal(match.toolAction?.args.title, 'GLP-1 Friendly Garlicky Shrimp Couscous Bowls')
  assert.equal(match.toolAction?.args.recipeId, '7ffeeac2-31b4-4e75-9a4c-7ffda8fe98b9')
})

test('matchDinnerPlanIntent: conversational option 3 ("pasta") prepares switch to vodka sauce pasta', () => {
  const match = matchDinnerPlanIntent('lets go with pasta', defaultCookPlan)
  assert.ok(match)
  assert.equal(match.toolAction?.args.title, 'Protein Pasta A La Vodka Sauce')
  assert.equal(match.toolAction?.args.recipeId, 'ccb3a07d-d7f4-40b3-a10b-24e5cbf16d3a')
})

test('matchDinnerPlanIntent: conversational taco request prepares switch to salmon tacos', () => {
  const match = matchDinnerPlanIntent('make fish tacos', defaultCookPlan)
  assert.ok(match)
  assert.equal(match.toolAction?.args.title, 'Prep & Bake Tex-Mex Salmon Tacos')
  assert.equal(match.toolAction?.args.recipeId, '393c85bb-9199-4b27-a90b-3703ec5918d3')
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

test('matchDinnerPlanIntent: matches Pizza Night request', () => {
  const match = matchDinnerPlanIntent('Pizza Night', defaultCookPlan)
  assert.ok(match)
  assert.ok(match.toolAction)
  assert.equal(match.toolAction.args.mode, 'takeout')
  assert.match(match.toolAction.args.title, /Pizza Night/)
})

test('matchDinnerPlanIntent: matches Reheat Leftovers request', () => {
  const match = matchDinnerPlanIntent('Reheat Leftovers', defaultCookPlan)
  assert.ok(match)
  assert.ok(match.toolAction)
  assert.equal(match.toolAction.args.mode, 'leftovers')
  assert.match(match.toolAction.args.title, /Leftovers/)
})

test('matchDinnerPlanIntent: matches Dining Out request', () => {
  const match = matchDinnerPlanIntent('Dining Out', defaultCookPlan)
  assert.ok(match)
  assert.ok(match.toolAction)
  assert.equal(match.toolAction.args.mode, 'dineout')
  assert.match(match.toolAction.args.title, /Dining Out/)
})

test('matchDinnerPlanIntent: matches Switch to Cooking request', () => {
  const match = matchDinnerPlanIntent('Switch to Cooking', flanigansPlan)
  assert.ok(match)
  assert.ok(match.toolAction)
  assert.equal(match.toolAction.args.mode, 'cook')
  assert.match(match.toolAction.args.title, /Garlic Butter Shrimp Scampi/)
})

test('matchDinnerPlanIntent: pushing time to 7:00 PM recalculates order window accurately', () => {
  const pushMatch = matchDinnerPlanIntent('Push dinner to 7:00 PM', flanigansPlan)
  assert.ok(pushMatch)
  assert.ok(pushMatch.toolAction)
  assert.equal(pushMatch.toolAction.args.targetTime, '7:00 PM Target')
  assert.match(pushMatch.toolAction.args.subtitle, /6:15 PM–6:30 PM/)
  assert.match(pushMatch.assistantReply, /7:00 PM/)
})

test('matchDinnerPlanIntent: reassigns driver to Kelly or Giselle or Jake', () => {
  const matchKelly = matchDinnerPlanIntent('Kelly is picking up', flanigansPlan)
  assert.ok(matchKelly)
  assert.equal(matchKelly.toolAction?.args.chefOrDriver, 'Kelly')
  assert.match(matchKelly.toolAction?.args.subtitle, /Pickup: Kelly/)

  const matchGiselle = matchDinnerPlanIntent('Giselle is picking up', flanigansPlan)
  assert.ok(matchGiselle)
  assert.equal(matchGiselle.toolAction?.args.chefOrDriver, 'Giselle')
})

test('matchDinnerPlanIntent: advances status when order is placed or food ready', () => {
  const matchPlaced = matchDinnerPlanIntent('Order placed', flanigansPlan)
  assert.ok(matchPlaced)
  assert.match(matchPlaced.toolAction?.args.statusBadge, /Order placed/)

  const matchReady = matchDinnerPlanIntent('Food ready for pickup', flanigansPlan)
  assert.ok(matchReady)
  assert.match(matchReady.toolAction?.args.statusBadge, /ready for pickup/)
})

test('matchDinnerPlanIntent: pantry AI trigger provides friendly ingredient guidance', () => {
  const match = matchDinnerPlanIntent('Cook with what we have (Pantry AI)', defaultCookPlan)
  assert.ok(match)
  assert.equal(match.toolAction, undefined)
  assert.match(match.assistantReply, /pantry/)
})

test('getDinnerPlanSuggestions: contextually adapts chips based on current plan', () => {
  const cookSuggestions = getDinnerPlanSuggestions(defaultCookPlan)
  assert.ok(cookSuggestions.includes("🥡 Takeout from Flanigan's"))
  assert.ok(cookSuggestions.includes('🍕 Pizza Night'))
  assert.ok(cookSuggestions.includes('🍲 Reheat Leftovers'))
  assert.ok(cookSuggestions.includes('📖 Swap saved recipe'))

  const flanigansSuggestions = getDinnerPlanSuggestions(flanigansPlan)
  assert.ok(flanigansSuggestions.includes('⏰ Push dinner to 7:00 PM'))
  assert.ok(flanigansSuggestions.includes('🚗 Kelly picking up') || flanigansSuggestions.includes('🚗 Jake picking up'))
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
  assert.match(drawerSource, /saveTonightDinnerPlan/)
  assert.match(drawerSource, /tonights-kitchen/)
})

test('code integrity: CookPage Weekly Horizon implements touch & mouse drag-and-drop reordering with Realtime sync', async () => {
  const cookSource = await readFile(
    new URL('../src/pages/CookPage.tsx', import.meta.url),
    'utf8',
  )

  // Drag and drop state & handlers exist
  assert.match(cookSource, /moveOrSwapWeeklyMeal/)
  assert.match(cookSource, /handleHorizonDragStart/)
  assert.match(cookSource, /handleHorizonTouchStart/)
  assert.match(cookSource, /handleHorizonTouchMove/)
  assert.match(cookSource, /handleHorizonTouchEnd/)

  // Day cards are marked with data-horizon-date and grip handle
  assert.match(cookSource, /data-horizon-date/)
  assert.match(cookSource, /GripVertical/)
  assert.match(cookSource, /draggable=\{isAssigned\}/)
  assert.match(cookSource, /saveTonightDinnerPlan/)
})
