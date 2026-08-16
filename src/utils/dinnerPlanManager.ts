import type { DinnerPlan, DinnerMode } from '../types'

export interface LibraryFeaturedRecipe {
  num: number
  id: string
  name: string
  cookTime: string
  keywords: string[]
}

export const FEATURED_RECIPES: LibraryFeaturedRecipe[] = [
  {
    num: 1,
    id: '8cfa3cd2-a68f-4b73-912f-92865ba1ee6a',
    name: 'Garlic Butter Shrimp Scampi',
    cookTime: '30 min',
    keywords: ['scampi', 'shrimp scampi', 'garlic butter shrimp', 'garlic shrimp'],
  },
  {
    num: 2,
    id: '7ffeeac2-31b4-4e75-9a4c-7ffda8fe98b9',
    name: 'GLP-1 Friendly Garlicky Shrimp Couscous Bowls',
    cookTime: '25 min',
    keywords: ['couscous', 'shrimp couscous', 'garlicky shrimp couscous', 'couscous bowls', 'cous cous'],
  },
  {
    num: 3,
    id: 'ccb3a07d-d7f4-40b3-a10b-24e5cbf16d3a',
    name: 'Protein Pasta A La Vodka Sauce',
    cookTime: '20 min',
    keywords: ['pasta', 'vodka sauce', 'protein pasta', 'vodka pasta', 'pasta a la vodka', 'penne alla vodka'],
  },
  {
    num: 4,
    id: '40444761-e044-4b8d-8bf9-96ee7b7d8266',
    name: 'One-Pan Bang Bang Salmon Potato Bake',
    cookTime: '35 min',
    keywords: ['salmon', 'bang bang salmon', 'potato bake', 'salmon potato', 'bang bang', 'salmon bake'],
  },
  {
    num: 5,
    id: '393c85bb-9199-4b27-a90b-3703ec5918d3',
    name: 'Prep & Bake Tex-Mex Salmon Tacos',
    cookTime: '25 min',
    keywords: ['tacos', 'salmon tacos', 'tex-mex', 'tex mex', 'fish tacos'],
  },
  {
    num: 6,
    id: '05de8be3-4cae-4d16-8e3b-f731af415881',
    name: 'GLP-1 Friendly Sheet Pan Mexican Spiced Tilapia',
    cookTime: '35 min',
    keywords: ['tilapia', 'mexican tilapia', 'sheet pan tilapia', 'spiced tilapia'],
  },
  {
    num: 7,
    id: 'abbab0a7-3514-4037-a47b-ca58ca076b3b',
    name: 'Pistachio Cod with Mango-Jalapeño Salsa',
    cookTime: '30 min',
    keywords: ['cod', 'pistachio cod', 'mango salsa cod', 'pistachio'],
  },
  {
    num: 8,
    id: 'd5cd3132-ee0a-43f7-9c34-7eddcb38daf8',
    name: 'Quick Salmon Power Bowls',
    cookTime: '45 min',
    keywords: ['power bowls', 'salmon power bowl', 'power bowl', 'salmon bowl'],
  },
  {
    num: 9,
    id: 'fc5992a3-ffd6-4be0-acc6-86edc1c9a266',
    name: 'Spicy Mexican Style Barramundi',
    cookTime: '30 min',
    keywords: ['barramundi', 'mexican barramundi', 'spicy barramundi'],
  },
]

/**
 * Calculates a realistic prep or order window relative to target time.
 * E.g. for Takeout with Target 6:30 PM, order window is 5:45–6:00 PM.
 * For Target 7:00 PM, order window is 6:15–6:30 PM.
 */
export function calculateOrderOrPrepWindow(
  mode: DinnerMode,
  targetTimeStr: string,
  driverOrChef?: string
): { subtitle: string; statusBadge: string } {
  const match = targetTimeStr.match(/(\d+)(?::(\d+))?\s*(AM|PM)/i)
  let targetHours = 18
  let targetMinutes = 30
  let isPm = true

  if (match) {
    targetHours = parseInt(match[1], 10)
    targetMinutes = match[2] ? parseInt(match[2], 10) : 0
    isPm = match[3].toUpperCase() === 'PM'
    if (isPm && targetHours < 12) targetHours += 12
    if (!isPm && targetHours === 12) targetHours = 0
  }

  // Format time helper
  const formatTime = (h: number, m: number) => {
    const period = h >= 12 ? 'PM' : 'AM'
    const dispH = h % 12 === 0 ? 12 : h % 12
    const dispM = m.toString().padStart(2, '0')
    return `${dispH}:${dispM} ${period}`
  }

  if (mode === 'takeout') {
    // 45 min before target for order start, 30 min before for order cutoff
    let orderStartMins = targetHours * 60 + targetMinutes - 45
    let orderEndMins = targetHours * 60 + targetMinutes - 30
    if (orderStartMins < 0) orderStartMins += 24 * 60
    if (orderEndMins < 0) orderEndMins += 24 * 60

    const startStr = formatTime(Math.floor(orderStartMins / 60), orderStartMins % 60)
    const endStr = formatTime(Math.floor(orderEndMins / 60), orderEndMins % 60)
    const driver = driverOrChef || 'Jake'

    return {
      subtitle: `Pickup: ${driver} (on route) · Order window: ${startStr}–${endStr}`,
      statusBadge: 'Order pending',
    }
  }

  if (mode === 'cook') {
    const chef = driverOrChef || 'Jake & Kelly'
    return {
      subtitle: `25m prep · Pantry stock confirmed · Chef: ${chef}`,
      statusBadge: 'Ingredients ready',
    }
  }

  if (mode === 'leftovers') {
    return {
      subtitle: '10m reheat · Low effort · Reheat pantry & fridge containers',
      statusBadge: 'In fridge ready to heat',
    }
  }

  if (mode === 'dineout') {
    let departMins = targetHours * 60 + targetMinutes - 30
    if (departMins < 0) departMins += 24 * 60
    const departStr = formatTime(Math.floor(departMins / 60), departMins % 60)
    return {
      subtitle: `Table for family · Depart by ${departStr} · Casual dining`,
      statusBadge: 'Table open',
    }
  }

  return {
    subtitle: 'Family dinner plan',
    statusBadge: 'Planned',
  }
}

/**
 * Derives contextual suggestion chips based on the active dinner plan
 */
export function getDinnerPlanSuggestions(currentPlan: DinnerPlan): string[] {
  const mode = currentPlan.mode
  const targetTime = currentPlan.targetTime || '6:30 PM Target'
  const isSevenPmOrLater = /7:(?:00|15|30)\s*PM/i.test(targetTime)
  const isKellyDriverOrChef = /kelly/i.test(currentPlan.chefOrDriver || currentPlan.subtitle)
  const isJakeDriverOrChef = /jake/i.test(currentPlan.chefOrDriver || currentPlan.subtitle)

  if (mode === 'takeout') {
    const suggestions: string[] = []
    // Time push suggestion
    if (!isSevenPmOrLater) {
      suggestions.push('⏰ Push dinner to 7:00 PM')
    } else {
      suggestions.push('⏰ Push dinner to 7:30 PM')
    }

    // Driver switch between real adult family members
    if (/luke/i.test(currentPlan.chefOrDriver || currentPlan.subtitle)) {
      suggestions.push('🚗 Sarah picking up')
    } else if (isJakeDriverOrChef) {
      suggestions.push('🚗 Kelly picking up')
    } else if (isKellyDriverOrChef) {
      suggestions.push('🚗 Giselle picking up')
    } else {
      suggestions.push('🚗 Jake picking up')
    }

    // Status advances
    if (currentPlan.statusBadge === 'Order pending') {
      suggestions.push('📞 Order placed')
    } else if (currentPlan.statusBadge?.includes('placed')) {
      suggestions.push('✅ Food ready for pickup')
    }

    // Pivot back to home cooked or leftovers
    suggestions.push('🍳 Switch to Cooking')
    suggestions.push('🍲 Reheat Leftovers')
    return suggestions.slice(0, 5)
  }

  if (mode === 'cook') {
    return [
      '🥗 Cook with what we have (Pantry AI)',
      '📖 Swap saved recipe',
      "🥡 Takeout from Flanigan's",
      '🍕 Pizza Night',
      '🍲 Reheat Leftovers',
      isSevenPmOrLater ? '⏰ Push dinner to 7:30 PM' : '⏰ Push dinner to 7:00 PM',
      isJakeDriverOrChef ? '👩‍🍳 Kelly is Chef tonight' : '👨‍🍳 Jake is Chef tonight',
    ]
  }

  if (mode === 'leftovers') {
    return [
      '🥗 Cook with what we have (Pantry AI)',
      '📖 Swap saved recipe',
      "🥡 Takeout from Flanigan's",
      '🍳 Switch to Cooking',
      isSevenPmOrLater ? '⏰ Push dinner to 7:30 PM' : '⏰ Push dinner to 7:00 PM',
      '🍽️ Dining Out',
    ]
  }

  if (mode === 'dineout') {
    return [
      "🥡 Takeout from Flanigan's",
      '🍳 Switch to Cooking',
      '🍲 Reheat Leftovers',
      '⏰ Push dinner to 7:30 PM',
      '🚗 Jake is driving',
    ]
  }

  return [
    '🥗 Cook with what we have (Pantry AI)',
    '📖 Swap saved recipe',
    "🥡 Takeout from Flanigan's",
    '🍲 Reheat Leftovers',
    '⏰ Push dinner to 7:00 PM',
  ]
}

/**
 * Matches conversational user inputs or quick chips to structured dinner intents.
 */
export function matchDinnerPlanIntent(
  text: string,
  currentPlan: DinnerPlan
): {
  assistantReply: string
  toolAction?: {
    tool: 'update_dinner_plan'
    status: 'pending'
    displayText: string
    args: Record<string, unknown>
  }
} | null {
  const normalized = text.toLowerCase().trim()

  // 1. Status advancement (Order placed, food ready for pickup)
  if (normalized.includes('order placed') || normalized.includes('placed the order') || normalized.includes('called in')) {
    const newPlan: DinnerPlan = {
      ...currentPlan,
      statusBadge: 'Order placed · Awaiting pickup',
    }

    return {
      assistantReply: `Marked **${currentPlan.title}** as **Order Placed**! Pickup window is active.`,
      toolAction: {
        tool: 'update_dinner_plan',
        status: 'pending',
        displayText: 'Mark Order as Placed',
        args: newPlan,
      },
    }
  }

  if (normalized.includes('food ready') || normalized.includes('ready for pickup') || normalized.includes('food is ready')) {
    const newPlan: DinnerPlan = {
      ...currentPlan,
      statusBadge: 'Order ready for pickup',
    }

    return {
      assistantReply: `Marked **${currentPlan.title}** as **Ready for pickup** at restaurant.`,
      toolAction: {
        tool: 'update_dinner_plan',
        status: 'pending',
        displayText: 'Mark Food Ready for Pickup',
        args: newPlan,
      },
    }
  }

  // 2. Push Time / Shift Dinner Hour (e.g. "Push dinner to 7:00 PM", "Make it 7:30", "Push to 8:00")
  if (
    normalized.includes('push') ||
    normalized.includes('later') ||
    normalized.includes('reschedule') ||
    /\b(?:make it|set to|shift to|delay to|dinner at)\s*\d{1,2}(?::\d{2})?\s*(?:pm|am)?\b/i.test(normalized)
  ) {
    let newTargetTime = '7:00 PM Target'
    if (normalized.includes('7:30')) newTargetTime = '7:30 PM Target'
    else if (normalized.includes('8:00') || normalized.includes('8pm') || normalized.includes('8 pm')) newTargetTime = '8:00 PM Target'
    else if (normalized.includes('6:45')) newTargetTime = '6:45 PM Target'
    else if (normalized.includes('6:30')) newTargetTime = '6:30 PM Target'
    else if (normalized.includes('7:00') || normalized.includes('7pm') || normalized.includes('7 pm')) newTargetTime = '7:00 PM Target'
    else if (currentPlan.targetTime?.includes('7:00')) newTargetTime = '7:30 PM Target'

    const windowInfo = calculateOrderOrPrepWindow(currentPlan.mode, newTargetTime, currentPlan.chefOrDriver)
    const newPlan: DinnerPlan = {
      ...currentPlan,
      targetTime: newTargetTime,
      subtitle: windowInfo.subtitle,
    }

    return {
      assistantReply: `I've shifted the target time for **${currentPlan.title}** to **${newTargetTime}**. The pickup and prep windows have been adjusted accordingly.`,
      toolAction: {
        tool: 'update_dinner_plan',
        status: 'pending',
        displayText: `Push dinner time to ${newTargetTime.replace(' Target', '')}`,
        args: newPlan,
      },
    }
  }

  // 3. Takeout: Flanigan's
  if (normalized.includes('flanigan') || normalized.includes('flanigans')) {
    const target = currentPlan.targetTime || '6:30 PM Target'
    const windowInfo = calculateOrderOrPrepWindow('takeout', target, 'Jake')
    const newPlan: DinnerPlan = {
      mode: 'takeout',
      title: "Flanigan's Seafood Bar & Grill",
      subtitle: windowInfo.subtitle,
      targetTime: target,
      chefOrDriver: 'Jake',
      statusBadge: windowInfo.statusBadge,
    }

    return {
      assistantReply: `I've drafted a pivot to **Flanigan's Seafood Bar & Grill (Takeout)** for tonight. Target time is **${target}**, and Jake is assigned for pickup. The order is marked **pending** so you can call it in when ready.`,
      toolAction: {
        tool: 'update_dinner_plan',
        status: 'pending',
        displayText: "Update Tonight's Kitchen to Flanigan's Takeout",
        args: newPlan,
      },
    }
  }

  // 4. Takeout: Pizza Night
  if (normalized.includes('pizza')) {
    const target = currentPlan.targetTime || '6:45 PM Target'
    const windowInfo = calculateOrderOrPrepWindow('takeout', target, 'Kelly')
    const newPlan: DinnerPlan = {
      mode: 'takeout',
      title: 'Pizza Night (Takeout & Delivery)',
      subtitle: windowInfo.subtitle,
      targetTime: target,
      chefOrDriver: 'Kelly',
      statusBadge: windowInfo.statusBadge,
    }

    return {
      assistantReply: `I've drafted a **Pizza Night** pivot for **${target}**. Kelly is assigned for pickup/delivery, and the order is marked as **pending**.`,
      toolAction: {
        tool: 'update_dinner_plan',
        status: 'pending',
        displayText: "Update Tonight's Kitchen to Pizza Night",
        args: newPlan,
      },
    }
  }

  // 5. Leftovers
  if (normalized.includes('leftover') || normalized.includes('reheat')) {
    const target = currentPlan.targetTime || '6:15 PM Target'
    const windowInfo = calculateOrderOrPrepWindow('leftovers', target)
    const newPlan: DinnerPlan = {
      mode: 'leftovers',
      title: 'Reheat Leftovers & Easy Sides',
      subtitle: windowInfo.subtitle,
      targetTime: target,
      chefOrDriver: 'Quick Heat',
      statusBadge: windowInfo.statusBadge,
    }

    return {
      assistantReply: `I've drafted a **Leftovers & Easy Sides** plan for **${target}**. Zero prep, quick reheat from pantry and fridge.`,
      toolAction: {
        tool: 'update_dinner_plan',
        status: 'pending',
        displayText: "Update Tonight's Kitchen to Leftovers",
        args: newPlan,
      },
    }
  }

  // 6. Dining Out
  if (normalized.includes('din') && (normalized.includes('out') || normalized.includes('restaurant'))) {
    const target = '7:00 PM Target'
    const windowInfo = calculateOrderOrPrepWindow('dineout', target)
    const newPlan: DinnerPlan = {
      mode: 'dineout',
      title: 'Dining Out · Family Dinner',
      subtitle: windowInfo.subtitle,
      targetTime: target,
      chefOrDriver: 'Family Car',
      statusBadge: windowInfo.statusBadge,
    }

    return {
      assistantReply: `I've drafted a **Dining Out** family dinner plan for **7:00 PM**.`,
      toolAction: {
        tool: 'update_dinner_plan',
        status: 'pending',
        displayText: "Update Tonight's Kitchen to Dining Out",
        args: newPlan,
      },
    }
  }

  // 7. Switch to Cooking (Reverting back from Takeout / Leftovers)
  if (
    normalized === 'switch to cooking' ||
    normalized === 'cooking' ||
    normalized.includes('switch to cooking') ||
    normalized.includes('home cooked') ||
    normalized.includes("let's cook") ||
    normalized.includes('cook tonight')
  ) {
    const target = currentPlan.targetTime || '6:30 PM Target'
    const windowInfo = calculateOrderOrPrepWindow('cook', target, 'Jake & Kelly')
    const currentTitle = currentPlan.mode === 'cook' ? currentPlan.title : 'Garlic Butter Shrimp Scampi'
    const currentRecipeId = currentPlan.mode === 'cook' && currentPlan.recipeId ? currentPlan.recipeId : '8cfa3cd2-a68f-4b73-912f-92865ba1ee6a'
    const newPlan: DinnerPlan = {
      mode: 'cook',
      title: currentTitle,
      subtitle: windowInfo.subtitle,
      targetTime: target,
      recipeId: currentRecipeId,
      chefOrDriver: 'Jake & Kelly',
      statusBadge: windowInfo.statusBadge,
    }

    return {
      assistantReply: `Switched Tonight's Kitchen back to **Home Cooking**: **${currentTitle}** for **${target}**.`,
      toolAction: {
        tool: 'update_dinner_plan',
        status: 'pending',
        displayText: "Switch Tonight's Kitchen to Home Cooking",
        args: newPlan,
      },
    }
  }

  // 8. Pantry AI generation trigger
  if (
    normalized.includes('cook with what we have') ||
    normalized.includes('pantry ai') ||
    normalized.includes('on hand') ||
    normalized.includes('what we have') ||
    normalized.includes('make from pantry')
  ) {
    return {
      assistantReply: `Let's make something delicious with what's on hand in the pantry! 🥗\n\nI can draft a fast, family-friendly dinner using your current stock (e.g. seafood, pasta, vegetables, or proteins).\n\nTell me what ingredients you'd like to use (e.g. "Shrimp and pasta" or "Quick 20m high-protein meal"), and I'll generate the full step-by-step recipe ready for Tonight's Kitchen!`,
      toolAction: undefined,
    }
  }

  // 9. Swap recipe query / show options
  if (
    normalized === 'swap saved recipe' ||
    normalized === 'swap recipe' ||
    normalized === 'change recipe' ||
    normalized === 'switch recipe' ||
    normalized === 'change tonight' ||
    normalized === 'switch tonight' ||
    normalized.includes('swap saved recipe') ||
    normalized.includes('swap recipe') ||
    normalized.includes('change recipe') ||
    normalized.includes('switch recipe') ||
    normalized.includes('show recipes') ||
    normalized.includes('other recipes') ||
    normalized.includes('suggest recipe')
  ) {
    return {
      assistantReply: `Here are popular recipes from your library you can switch tonight's dinner to:\n\n1. **Garlic Butter Shrimp Scampi** (30 min)\n2. **GLP-1 Friendly Garlicky Shrimp Couscous Bowls** (25 min)\n3. **Protein Pasta A La Vodka Sauce** (20 min)\n4. **One-Pan Bang Bang Salmon Potato Bake** (35 min)\n\nReply with the recipe name or number (1–4) you'd like to make, or tell me a flavor profile!`,
      toolAction: undefined,
    }
  }

  // 10. Number / Option Selection (e.g. "lets go with 4", "4", "option 4", "number 2", "the fourth one", "#1")
  let chosenRecipe: LibraryFeaturedRecipe | undefined

  const numberPatterns = [
    /^(?:option|number|choice|#)?\s*([1-9])$/i,
    /\b(?:lets|let's|we'?ll|i'?d like to|please)?\s*(?:go with|do|pick|choose|select|make|cook)\s+(?:option|number|choice|#)?\s*([1-9])\b/i,
    /\b(?:option|number|choice|#)\s*([1-9])\b/i,
  ]

  for (const pat of numberPatterns) {
    const m = normalized.match(pat)
    if (m && m[1]) {
      const n = parseInt(m[1], 10)
      chosenRecipe = FEATURED_RECIPES.find((r) => r.num === n)
      if (chosenRecipe) break
    }
  }

  // Ordinals
  if (!chosenRecipe) {
    if (/\b(?:first|1st)\b/i.test(normalized)) chosenRecipe = FEATURED_RECIPES[0]
    else if (/\b(?:second|2nd)\b/i.test(normalized)) chosenRecipe = FEATURED_RECIPES[1]
    else if (/\b(?:third|3rd)\b/i.test(normalized)) chosenRecipe = FEATURED_RECIPES[2]
    else if (/\b(?:fourth|4th)\b/i.test(normalized)) chosenRecipe = FEATURED_RECIPES[3]
    else if (/\b(?:fifth|5th)\b/i.test(normalized)) chosenRecipe = FEATURED_RECIPES[4]
  }

  // 11. Direct Recipe Keyword Matching (e.g. "bang bang salmon", "pasta", "scampi", "couscous", "tacos", "tilapia", "cod", "barramundi")
  if (!chosenRecipe) {
    for (const recipe of FEATURED_RECIPES) {
      if (normalized.includes(recipe.name.toLowerCase())) {
        chosenRecipe = recipe
        break
      }
      for (const kw of recipe.keywords) {
        if (normalized.includes(kw)) {
          chosenRecipe = recipe
          break
        }
      }
      if (chosenRecipe) break
    }
  }

  // If a recipe is chosen (by number or name), formulate the switch to cook plan
  if (chosenRecipe) {
    const target = currentPlan.targetTime || '6:30 PM Target'
    const newPlan: DinnerPlan = {
      mode: 'cook',
      title: chosenRecipe.name,
      subtitle: `${chosenRecipe.cookTime} prep · Pantry stock confirmed · Chef: Jake & Kelly`,
      targetTime: target,
      recipeId: chosenRecipe.id,
      chefOrDriver: 'Jake & Kelly',
      statusBadge: 'Ingredients ready',
    }

    return {
      assistantReply: `I've prepared the switch to **${chosenRecipe.name}** (${chosenRecipe.cookTime}) for tonight's dinner with Jake & Kelly as chefs. Target time is **${target}**.`,
      toolAction: {
        tool: 'update_dinner_plan',
        status: 'pending',
        displayText: `Set Tonight's Dinner to ${chosenRecipe.name}`,
        args: newPlan,
      },
    }
  }

  // 12. Driver / Chef reassignment with real household members or requested driver
  if (
    normalized.includes('pickup') ||
    normalized.includes('picking up') ||
    normalized.includes('driver') ||
    normalized.includes('driving') ||
    normalized.includes('chef') ||
    normalized.includes('sarah') ||
    normalized.includes('jake') ||
    normalized.includes('kelly') ||
    normalized.includes('giselle') ||
    normalized.includes('luke')
  ) {
    let name = 'Jake'
    if (normalized.includes('sarah')) name = 'Sarah'
    else if (normalized.includes('kelly')) name = 'Kelly'
    else if (normalized.includes('giselle')) name = 'Giselle'
    else if (normalized.includes('luke')) name = 'Luke'
    else if (normalized.includes('jake')) name = 'Jake'
    else {
      const match = normalized.match(/([a-z]+)\s+(?:is\s+)?(?:picking up|pickup|driver|driving|chef|cook|cooking)/i)
      if (match?.[1]) {
        name = match[1].charAt(0).toUpperCase() + match[1].slice(1)
      }
    }

    const windowInfo = calculateOrderOrPrepWindow(currentPlan.mode, currentPlan.targetTime, name)
    const newPlan: DinnerPlan = {
      ...currentPlan,
      chefOrDriver: name,
      subtitle: windowInfo.subtitle,
    }

    return {
      assistantReply: `Assigned **${name}** for tonight's ${currentPlan.mode === 'takeout' ? 'pickup' : 'cooking'} duties for **${currentPlan.title}**.`,
      toolAction: {
        tool: 'update_dinner_plan',
        status: 'pending',
        displayText: `Assign ${name} for dinner duties`,
        args: newPlan,
      },
    }
  }

  // 13. Informational / Query fallback
  if (
    (normalized.includes('update') || normalized.includes('change') || normalized.includes('how do i update') || normalized.includes('what is') || normalized.includes('tell me about')) &&
    (normalized.includes('dinner') || normalized.includes('kitchen') || normalized.includes('tonight'))
  ) {
    return {
      assistantReply: `Currently, tonight's kitchen is planned for **${currentPlan.title}** (${currentPlan.targetTime || '6:30 PM Target'}, Status: *${currentPlan.statusBadge || 'Planned'}*).\n\nTap any quick option below to pivot to Takeout, Leftovers, adjust time, generate a recipe from pantry, or change chef/driver assignments!`,
      toolAction: undefined,
    }
  }

  return null
}
