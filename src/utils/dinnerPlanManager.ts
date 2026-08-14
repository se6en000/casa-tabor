import type { DinnerPlan, DinnerMode } from '../types'

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
    const driver = driverOrChef || 'Luke'

    return {
      subtitle: `Pickup: ${driver} (on route) · Order window: ${startStr}–${endStr}`,
      statusBadge: 'Order pending',
    }
  }

  if (mode === 'cook') {
    const chef = driverOrChef || 'Sarah & Luke'
    return {
      subtitle: `35m prep · Pantry stock confirmed · Chef: ${chef}`,
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
  const isSarahDriverOrChef = /sarah/i.test(currentPlan.chefOrDriver || currentPlan.subtitle)

  if (mode === 'takeout') {
    const suggestions: string[] = []
    // Time push suggestion
    if (!isSevenPmOrLater) {
      suggestions.push('⏰ Push dinner to 7:00 PM')
    } else {
      suggestions.push('⏰ Push dinner to 7:30 PM')
    }

    // Driver switch
    if (isSarahDriverOrChef) {
      suggestions.push('🚗 Luke picking up')
    } else {
      suggestions.push('🚗 Sarah picking up')
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
      "🥡 Takeout from Flanigan's",
      '🍕 Pizza Night',
      '🍲 Reheat Leftovers',
      isSevenPmOrLater ? '⏰ Push dinner to 7:30 PM' : '⏰ Push dinner to 7:00 PM',
      isSarahDriverOrChef ? '👨‍🍳 Luke is Chef tonight' : '👨‍🍳 Sarah is Chef tonight',
    ]
  }

  if (mode === 'leftovers') {
    return [
      "🥡 Takeout from Flanigan's",
      '🍕 Pizza Night',
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
      '🚗 Sarah is driving',
    ]
  }

  return [
    "🥡 Takeout from Flanigan's",
    '🍕 Pizza Night',
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

  // 1. Takeout: Flanigan's
  if (normalized.includes('flanigan')) {
    const target = currentPlan.targetTime || '6:30 PM Target'
    const windowInfo = calculateOrderOrPrepWindow('takeout', target, 'Luke')
    const newPlan: DinnerPlan = {
      mode: 'takeout',
      title: "Flanigan's Seafood Bar & Grill",
      subtitle: windowInfo.subtitle,
      targetTime: target,
      chefOrDriver: 'Luke',
      statusBadge: windowInfo.statusBadge,
    }

    return {
      assistantReply: `I've drafted a pivot to **Flanigan's Seafood Bar & Grill (Takeout)** for tonight. Target time is **${target}**, and Luke is available for pickup. The order is marked **pending** so you can call it in when ready.`,
      toolAction: {
        tool: 'update_dinner_plan',
        status: 'pending',
        displayText: "Update Tonight's Kitchen to Flanigan's Takeout",
        args: newPlan,
      },
    }
  }

  // 2. Takeout: Pizza Night
  if (normalized.includes('pizza')) {
    const target = currentPlan.targetTime || '6:45 PM Target'
    const windowInfo = calculateOrderOrPrepWindow('takeout', target, 'Sarah')
    const newPlan: DinnerPlan = {
      mode: 'takeout',
      title: 'Pizza Night (Takeout & Delivery)',
      subtitle: windowInfo.subtitle,
      targetTime: target,
      chefOrDriver: 'Sarah',
      statusBadge: windowInfo.statusBadge,
    }

    return {
      assistantReply: `I've drafted a **Pizza Night** pivot for **${target}**. Sarah is assigned for pickup/delivery, and the order is marked as **pending**.`,
      toolAction: {
        tool: 'update_dinner_plan',
        status: 'pending',
        displayText: "Update Tonight's Kitchen to Pizza Night",
        args: newPlan,
      },
    }
  }

  // 3. Leftovers
  if (normalized.includes('leftover')) {
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

  // 4. Dining Out
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

  // 5. Cooking / Home cooked switch
  if (normalized.includes('switch to cooking') || normalized.includes('cook a recipe') || normalized.includes('home cooked')) {
    const target = currentPlan.targetTime || '6:30 PM Target'
    const windowInfo = calculateOrderOrPrepWindow('cook', target, 'Sarah & Luke')
    const newPlan: DinnerPlan = {
      mode: 'cook',
      title: 'Herb-Roasted Chicken & Warm Farro',
      subtitle: windowInfo.subtitle,
      targetTime: target,
      chefOrDriver: 'Sarah & Luke',
      statusBadge: windowInfo.statusBadge,
    }

    return {
      assistantReply: `Switched Tonight's Kitchen back to **Home Cooking**: Herb-Roasted Chicken & Warm Farro for **${target}**.`,
      toolAction: {
        tool: 'update_dinner_plan',
        status: 'pending',
        displayText: "Switch Tonight's Kitchen to Home Cooking",
        args: newPlan,
      },
    }
  }

  // 6. Push time (7:00 PM or 7:30 PM or custom time)
  if (normalized.includes('push') || normalized.includes('later') || normalized.includes('reschedule') || /\b\d{1,2}(?::\d{2})?\s*(?:pm|am)\b/i.test(normalized)) {
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
      assistantReply: `I've shifted the target time for **${currentPlan.title}** to **${newTargetTime}**. The pickup and order windows have been adjusted accordingly.`,
      toolAction: {
        tool: 'update_dinner_plan',
        status: 'pending',
        displayText: `Push dinner time to ${newTargetTime.replace(' Target', '')}`,
        args: newPlan,
      },
    }
  }

  // 7. Driver / Chef reassignment
  if (normalized.includes('sarah') && (normalized.includes('pickup') || normalized.includes('picking up') || normalized.includes('driver') || normalized.includes('chef') || normalized.includes('cook'))) {
    const windowInfo = calculateOrderOrPrepWindow(currentPlan.mode, currentPlan.targetTime, 'Sarah')
    const newPlan: DinnerPlan = {
      ...currentPlan,
      chefOrDriver: 'Sarah',
      subtitle: windowInfo.subtitle,
    }

    return {
      assistantReply: `Assigned **Sarah** for tonight's ${currentPlan.mode === 'takeout' ? 'pickup' : 'cooking'} duties for **${currentPlan.title}**.`,
      toolAction: {
        tool: 'update_dinner_plan',
        status: 'pending',
        displayText: 'Assign Sarah for pickup',
        args: newPlan,
      },
    }
  }

  if (normalized.includes('luke') && (normalized.includes('pickup') || normalized.includes('picking up') || normalized.includes('driver') || normalized.includes('chef') || normalized.includes('cook'))) {
    const windowInfo = calculateOrderOrPrepWindow(currentPlan.mode, currentPlan.targetTime, 'Luke')
    const newPlan: DinnerPlan = {
      ...currentPlan,
      chefOrDriver: 'Luke',
      subtitle: windowInfo.subtitle,
    }

    return {
      assistantReply: `Assigned **Luke** for tonight's ${currentPlan.mode === 'takeout' ? 'pickup' : 'cooking'} duties for **${currentPlan.title}**.`,
      toolAction: {
        tool: 'update_dinner_plan',
        status: 'pending',
        displayText: 'Assign Luke for pickup',
        args: newPlan,
      },
    }
  }

  // 8. Status advancement (Order placed, food ready)
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

  if (normalized.includes('food ready') || normalized.includes('ready for pickup')) {
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

  // 9. Informational / Query fallback
  if (
    (normalized.includes('update') || normalized.includes('change') || normalized.includes('how do i update') || normalized.includes('what is')) &&
    (normalized.includes('dinner') || normalized.includes('kitchen') || normalized.includes('tonight'))
  ) {
    return {
      assistantReply: `Currently, tonight's kitchen is planned for **${currentPlan.title}** (${currentPlan.targetTime || '6:30 PM Target'}, Status: *${currentPlan.statusBadge || 'Planned'}*).\n\nTap any quick option below to pivot to Takeout, Leftovers, adjust time, or change pickup drivers!`,
      toolAction: undefined,
    }
  }

  return null
}
