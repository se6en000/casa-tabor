import { isCalendarLikeLanguage } from './assistant-calendar-language.mjs'
import { isGroceryLikeLanguage } from './assistant-grocery-language.mjs'

export function shouldPreferCalendarOverGrocery(text, options = {}) {
  if (isGroceryLikeLanguage(text) || !isCalendarLikeLanguage(text)) return false
  return Boolean(
    options.calendarFrame ||
    options.page === 'calendar' ||
    options.activeEntityType === 'event'
  )
}

export function isQuantifiedCalendarDelete(text) {
  const value = String(text ?? '')
  return /\b(?:delete|remove|cancel|clear|take)\b/i.test(value) &&
    /\b(?:all|both|each|every)\b/i.test(value) &&
    isCalendarLikeLanguage(value)
}

export function preferredAssistantLanguageDomain(options = {}) {
  if (options.calendarFrame && (options.preferCalendarDomain || !options.cookingFrame)) {
    return 'calendar'
  }
  if (options.cookingFrame) return 'cooking'
  if (options.calendarFrame) return 'calendar'
  return null
}
