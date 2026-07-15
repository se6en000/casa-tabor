const CALENDAR_TOOLS_BY_INTENT = Object.freeze({
  'event.create': new Set(['create_event']),
  'event.move': new Set(['update_event']),
  'event.edit': new Set(['update_event']),
  'event.delete': new Set(['delete_event']),
})

const GROCERY_TOOLS_BY_INTENT = Object.freeze({
  'grocery.add': new Set(['add_grocery_items']),
  'grocery.check': new Set(['check_grocery_item']),
  'grocery.uncheck': new Set(['check_grocery_item']),
  'grocery.quantity': new Set(['update_grocery_item_quantity']),
  'grocery.remove': new Set(['remove_grocery_item']),
  'grocery.clear_checked': new Set(['clear_checked_grocery_items']),
})

export function isAgentWriteCompatible(tool, context = {}) {
  const groceryTools = GROCERY_TOOLS_BY_INTENT[context.groceryIntent]
  if (groceryTools) return groceryTools.has(tool)
  if (String(context.groceryIntent ?? '').startsWith('grocery.')) return false

  const calendarTools = CALENDAR_TOOLS_BY_INTENT[context.calendarIntent]
  if (calendarTools) return calendarTools.has(tool)
  if (String(context.calendarIntent ?? '').startsWith('calendar.')) return false

  return true
}
