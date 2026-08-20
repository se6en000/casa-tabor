import { addDays, nextDay, setHours, setMinutes, startOfDay } from 'date-fns'
import type { FamilyMember, SavedPlace } from '../types'

export interface ParsedCalendarEntry {
  title: string
  eventType: 'event' | 'reminder'
  startDT: string
  endDT: string
  allDay: boolean
  matchedMemberIds: string[]
  matchedPlace: SavedPlace | null
  locationName?: string | null
  notes?: string
  confidence: number
  matchedDetailsCount: number
}

const DAY_MAP: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toLocalDT(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function parseCalendarNaturalLanguage(
  rawInput: string,
  contextDate: Date = new Date(),
  familyMembers: FamilyMember[] = [],
  savedPlaces: SavedPlace[] = [],
): ParsedCalendarEntry {
  let text = rawInput.trim()
  if (!text) {
    const defaultStart = new Date(contextDate)
    defaultStart.setHours(9, 0, 0, 0)
    const defaultEnd = new Date(defaultStart)
    defaultEnd.setHours(10, 0, 0, 0)
    return {
      title: '',
      eventType: 'event',
      startDT: toLocalDT(defaultStart),
      endDT: toLocalDT(defaultEnd),
      allDay: false,
      matchedMemberIds: [],
      matchedPlace: null,
      confidence: 0,
      matchedDetailsCount: 0,
    }
  }

  let matchedDetailsCount = 0

  // 1. Detect Event vs. Reminder
  let eventType: 'event' | 'reminder' = 'event'
  if (/^(remind\s+me\s+to|remind\s+|reminder:?|todo:?|task:?|don't\s+forget\s+to|need\s+to|have\s+to)\b/i.test(text)) {
    eventType = 'reminder'
    matchedDetailsCount++
    text = text.replace(/^(remind\s+me\s+to|remind\s+|reminder:?|todo:?|task:?|don't\s+forget\s+to|need\s+to|have\s+to)\s*/i, '')
  }

  // Strip conversational scheduling filler verbs
  text = text.replace(/^(schedule\s+a\s+|schedule\s+|add\s+a\s+|add\s+|book\s+a\s+|book\s+|create\s+a\s+|create\s+|plan\s+a\s+|plan\s+|set\s+up\s+a\s+|set\s+up\s+|put\s+(?:on\s+the\s+calendar|on\s+my\s+calendar)\s+)?/i, '')

  // 2. Detect All-Day flag
  let allDay = false
  if (/\b(all\s+day|all-day)\b/i.test(text)) {
    allDay = true
    matchedDetailsCount++
    text = text.replace(/\b(all\s+day|all-day)\b/i, '')
  }

  // 3. Match Family Members (Attendees)
  const matchedMemberIds: string[] = []
  for (const member of familyMembers) {
    if (!member.name) continue
    const nameRegex = new RegExp(`\\b${member.name}\\b`, 'i')
    if (nameRegex.test(text)) {
      if (!matchedMemberIds.includes(member.id)) {
        matchedMemberIds.push(member.id)
      }
    }
  }
  if (matchedMemberIds.length > 0) {
    matchedDetailsCount += matchedMemberIds.length
  }

  // Clean "with [Name]" or "for [Name]" or "and [Name]" from title
  for (const member of familyMembers) {
    if (!member.name) continue
    const withRegex = new RegExp(`\\b(with|for|and)\\s+${member.name}\\b`, 'gi')
    text = text.replace(withRegex, '')
  }

  // 4. Match Saved Places (Venues)
  let matchedPlace: SavedPlace | null = null
  let extractedLocationName: string | null = null

  for (const place of savedPlaces) {
    if (!place.name) continue
    const placeRegex = new RegExp(`\\b${place.name}\\b`, 'i')
    if (placeRegex.test(text)) {
      matchedPlace = place
      matchedDetailsCount++
      text = text.replace(new RegExp(`\\b(?:at|in|near)?\\s*${place.name}\\b`, 'gi'), '')
      break
    }
    // Check aliases if any
    if (place.aliases && Array.isArray(place.aliases)) {
      for (const alias of place.aliases) {
        if (!alias) continue
        const aliasRegex = new RegExp(`\\b${alias}\\b`, 'i')
        if (aliasRegex.test(text)) {
          matchedPlace = place
          matchedDetailsCount++
          text = text.replace(new RegExp(`\\b(?:at|in|near)?\\s*${alias}\\b`, 'gi'), '')
          break
        }
      }
    }
    if (matchedPlace) break
  }

  // If no saved place matched, check for generic "at [Location Name]"
  if (!matchedPlace) {
    const locMatch = text.match(/\b(?:at|in)\s+([A-Z][A-Za-z0-9\s'&.-]{2,30})(?=\s+(?:tomorrow|today|this|next|on|at\s+\d|\d{1,2}(?::\d{2})?\s*(?:am|pm)|for\s+\d)|$)/)
    if (locMatch && locMatch[1]) {
      const candLoc = locMatch[1].trim()
      if (!/^(morning|afternoon|evening|night|noon|midnight|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(candLoc)) {
        extractedLocationName = candLoc
        matchedDetailsCount++
        text = text.replace(locMatch[0], '')
      }
    }
  }

  // 5. Extract Date
  let targetDate = new Date(contextDate)
  let explicitDateFound = false

  if (/\btoday\b/i.test(text)) {
    targetDate = new Date()
    explicitDateFound = true
    matchedDetailsCount++
    text = text.replace(/\btoday\b/i, '')
  } else if (/\btomorrow\b/i.test(text)) {
    targetDate = addDays(new Date(), 1)
    explicitDateFound = true
    matchedDetailsCount++
    text = text.replace(/\btomorrow\b/i, '')
  } else {
    // Check for "this Friday", "next Tuesday", "on Monday", etc.
    const dayMatch = text.match(/\b(?:(this|next|on)\s+)?(monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|sunday|sun)\b/i)
    if (dayMatch) {
      const isNext = dayMatch[1]?.toLowerCase() === 'next'
      const dayName = dayMatch[2].toLowerCase()
      const targetDayOfWeek = DAY_MAP[dayName]
      if (targetDayOfWeek !== undefined) {
        const current = new Date()
        let calculated = nextDay(current, targetDayOfWeek)
        if (isNext) {
          calculated = addDays(calculated, 7)
        }
        targetDate = calculated
        explicitDateFound = true
        matchedDetailsCount++
        text = text.replace(dayMatch[0], '')
      }
    }
  }

  // 6. Extract Duration
  let durationMinutes = eventType === 'reminder' ? 0 : 60
  const durationMatch = text.match(/\bfor\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i)
  if (durationMatch) {
    const num = parseFloat(durationMatch[1])
    const unit = durationMatch[2].toLowerCase()
    if (unit.startsWith('h')) {
      durationMinutes = Math.round(num * 60)
    } else {
      durationMinutes = Math.round(num)
    }
    matchedDetailsCount++
    text = text.replace(durationMatch[0], '')
  }

  // 7. Extract Time
  let startHour = 9
  let startMinute = 0
  let explicitTimeFound = false

  // Check specific time: "9:30 am", "9am", "3:45pm", "10 pm", "14:00"
  const time12Match = text.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  const time24Match = text.match(/\b(?:at\s+)?(\d{1,2}):(\d{2})\b/i)
  const oclockMatch = text.match(/\b(?:at\s+)?(\d{1,2})\s*o'?clock\b/i)

  if (time12Match) {
    let hour = parseInt(time12Match[1], 10)
    const minute = time12Match[2] ? parseInt(time12Match[2], 10) : 0
    const period = time12Match[3].toLowerCase()
    if (period === 'pm' && hour < 12) hour += 12
    if (period === 'am' && hour === 12) hour = 0
    startHour = hour
    startMinute = minute
    explicitTimeFound = true
    matchedDetailsCount++
    text = text.replace(time12Match[0], '')
  } else if (time24Match) {
    startHour = parseInt(time24Match[1], 10)
    startMinute = parseInt(time24Match[2], 10)
    explicitTimeFound = true
    matchedDetailsCount++
    text = text.replace(time24Match[0], '')
  } else if (oclockMatch) {
    const hour = parseInt(oclockMatch[1], 10)
    startHour = hour < 8 ? hour + 12 : hour
    startMinute = 0
    explicitTimeFound = true
    matchedDetailsCount++
    text = text.replace(oclockMatch[0], '')
  } else {
    // Check day part keywords
    if (/\b(?:in\s+the\s+)?morning\b/i.test(text)) {
      startHour = 9
      startMinute = 0
      matchedDetailsCount++
      text = text.replace(/\b(?:in\s+the\s+)?morning\b/i, '')
    } else if (/\b(?:at\s+)?noon\b/i.test(text) || /\bmidday\b/i.test(text)) {
      startHour = 12
      startMinute = 0
      matchedDetailsCount++
      text = text.replace(/\b(?:at\s+)?noon\b/i, '').replace(/\bmidday\b/i, '')
    } else if (/\b(?:in\s+the\s+)?afternoon\b/i.test(text)) {
      startHour = 15
      startMinute = 30
      matchedDetailsCount++
      text = text.replace(/\b(?:in\s+the\s+)?afternoon\b/i, '')
    } else if (/\b(?:in\s+the\s+)?evening\b/i.test(text) || /\btonight\b/i.test(text)) {
      startHour = 18
      startMinute = 30
      matchedDetailsCount++
      text = text.replace(/\b(?:in\s+the\s+)?evening\b/i, '').replace(/\btonight\b/i, '')
    }
  }

  // 8. Clean trailing prepositions & clean up title
  let cleanTitle = text
    .replace(/\s+/g, ' ')
    .replace(/\b(at|on|for|with|by|in|and)\s*$/i, '')
    .replace(/^[\s,·\-\/]+|[\s,·\-\/]+$/g, '')
    .trim()

  // If clean title is empty (e.g. user just said "Friday at 9am"), give a sensible default
  if (!cleanTitle) {
    cleanTitle = eventType === 'reminder' ? 'Reminder' : 'New Event'
  } else {
    // Capitalize first letter
    cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1)
  }

  // Compute final start and end dates
  const start = setMinutes(setHours(startOfDay(targetDate), startHour), startMinute)
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000)

  return {
    title: cleanTitle,
    eventType,
    startDT: toLocalDT(start),
    endDT: toLocalDT(end),
    allDay,
    matchedMemberIds,
    matchedPlace,
    locationName: extractedLocationName,
    confidence:
      (explicitTimeFound ? 0.4 : 0) +
      (explicitDateFound ? 0.3 : 0) +
      (matchedMemberIds.length > 0 ? 0.2 : 0) +
      0.1,
    matchedDetailsCount: Math.max(1, matchedDetailsCount),
  }
}

