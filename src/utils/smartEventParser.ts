import { addHours, addDays, setHours, setMinutes } from 'date-fns'

export interface SmartParserMember {
  id: string
  name: string
}

export interface SmartParserPlace {
  id: string
  name: string
  aliases?: string[]
}

export interface ParsedSmartEvent {
  eventType: 'event' | 'reminder'
  title: string
  startDate: Date
  endDate: Date
  startDT: string
  endDT: string
  allDay: boolean
  matchedMemberIds: string[]
  matchedPlaceName: string | null
  rawLocation: string | null
  quickSlot: 'morning' | 'midday' | 'afternoon' | 'evening' | null
  confidence: number
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function toLocalDTString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const QUICK_SLOT_TIMES = {
  morning: { hour: 9, minute: 0, label: 'Morning 9:00 AM' },
  midday: { hour: 12, minute: 0, label: 'Midday 12:00 PM' },
  afternoon: { hour: 15, minute: 30, label: 'Afternoon 3:30 PM' },
  evening: { hour: 18, minute: 30, label: 'Evening 6:30 PM' },
} as const

/**
 * Parses hour and minute from strings like "7", "7:30", "7 P.M", "7pm", "19:00"
 */
function parseTimeComponents(timeStr: string, defaultMeridiem?: 'am' | 'pm'): { hour: number; minute: number } | null {
  const clean = timeStr.trim().toLowerCase().replace(/\./g, '')
  const match = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/)
  if (!match) return null

  let hour = parseInt(match[1], 10)
  const minute = match[2] ? parseInt(match[2], 10) : 0
  const meridiem = (match[3] as 'am' | 'pm' | undefined) ?? defaultMeridiem

  if (meridiem === 'pm' && hour < 12) {
    hour += 12
  } else if (meridiem === 'am' && hour === 12) {
    hour = 0
  } else if (!meridiem && hour >= 1 && hour <= 7) {
    // Household context: 1-7 without meridiem is usually PM (afternoon/evening)
    hour += 12
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

const DAY_NAME_TO_INDEX: Record<string, number> = {
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

/**
 * Extracts relative date from text
 */
function parseDateTarget(text: string, baseDate: Date): { date: Date; matchedText: string } {
  const lower = text.toLowerCase()

  if (/\btomorrow\b/.test(lower)) {
    return { date: addDays(baseDate, 1), matchedText: 'tomorrow' }
  }
  if (/\btonight\b/.test(lower)) {
    return { date: baseDate, matchedText: 'tonight' }
  }
  if (/\btoday\b/.test(lower)) {
    return { date: baseDate, matchedText: 'today' }
  }

  // Check day names (e.g., "this Friday", "next Monday", "Friday")
  for (const [dayName, targetDayIndex] of Object.entries(DAY_NAME_TO_INDEX)) {
    const regex = new RegExp(`\\b(?:(next|this)\\s+)?${dayName}\\b`, 'i')
    const match = lower.match(regex)
    if (match) {
      const isNext = match[1]?.toLowerCase() === 'next'
      const currentDayIndex = baseDate.getDay()
      let diff = targetDayIndex - currentDayIndex
      if (diff <= 0) diff += 7
      if (isNext && diff < 7) diff += 7
      return { date: addDays(baseDate, diff), matchedText: match[0] }
    }
  }

  return { date: baseDate, matchedText: '' }
}

/**
 * Parses natural language input into structured event properties.
 */
export function parseSmartEvent(
  rawInput: string,
  options: {
    referenceDate?: Date
    familyMembers?: SmartParserMember[]
    savedPlaces?: SmartParserPlace[]
  } = {},
): ParsedSmartEvent {
  const input = rawInput.trim()
  const baseDate = options.referenceDate ?? new Date()
  const members = options.familyMembers ?? []
  const places = options.savedPlaces ?? []

  if (!input) {
    const defaultStart = setMinutes(setHours(baseDate, 9), 0)
    const defaultEnd = addHours(defaultStart, 1)
    return {
      eventType: 'event',
      title: '',
      startDate: defaultStart,
      endDate: defaultEnd,
      startDT: toLocalDTString(defaultStart),
      endDT: toLocalDTString(defaultEnd),
      allDay: false,
      matchedMemberIds: [],
      matchedPlaceName: null,
      rawLocation: null,
      quickSlot: 'morning',
      confidence: 0,
    }
  }

  let workingText = input
  let confidence = 0.5
  const matchedMemberIds: string[] = []

  // 1. Check Family Members & Attendees FIRST
  const sortedMembers = [...members].sort((a, b) => b.name.length - a.name.length)
  for (const member of sortedMembers) {
    const namePattern = new RegExp(`\\b${member.name}\\b`, 'i')
    if (namePattern.test(workingText)) {
      matchedMemberIds.push(member.id)
      confidence += 0.15
      // Clean member name from working text
      workingText = workingText.replace(new RegExp(`\\b(?:with|for|to)\\s+${member.name}\\b`, 'i'), '')
      workingText = workingText.replace(new RegExp(`\\b${member.name}\\s+(?:is\\s+)?(?:to\\s+)?`, 'i'), '')
      workingText = workingText.replace(new RegExp(`\\b${member.name}\\b`, 'i'), '')
    }
  }

  // 2. Detect Reminder vs Event
  let eventType: 'event' | 'reminder' = 'event'
  const reminderMatch = workingText.match(/^(?:remind(?:\s+\w+)?\s+to|reminder(?:\s+to|\s*:)?|don'?t\s+forget\s+to|remind)\s+/i)
  if (reminderMatch) {
    eventType = 'reminder'
    workingText = workingText.slice(reminderMatch[0].length).trim()
    confidence += 0.1
  }

  // 3. Parse Date
  const { date: targetDate, matchedText: dateText } = parseDateTarget(workingText, baseDate)
  if (dateText) {
    workingText = workingText.replace(new RegExp(`\\b${dateText}\\b`, 'gi'), ' ').trim()
    confidence += 0.1
  }

  // 4. Parse Time Range or Single Time
  let startHour = 9
  let startMin = 0
  let endHour = 10
  let endMin = 0
  let timeExtracted = false
  let quickSlot: 'morning' | 'midday' | 'afternoon' | 'evening' | null = null

  // Pattern A: Range "from 7 P.M to 9 pm", "from 7:00 PM - 9:00 PM", "7 to 9pm", "7-9pm", "7:30pm to 8:30pm"
  const rangeRegex = /(?:from\s+)?(\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?)\s*(?:to|-|until|through)\s*(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?)/i
  const rangeMatch = workingText.match(rangeRegex)

  if (rangeMatch) {
    const rawStart = rangeMatch[1]
    const rawEnd = rangeMatch[2]
    const endMeridiem = rawEnd.toLowerCase().includes('p') ? 'pm' : 'am'
    const startMeridiem = rawStart.toLowerCase().includes('p') ? 'pm' : (rawStart.toLowerCase().includes('a') ? 'am' : endMeridiem)

    const startComp = parseTimeComponents(rawStart, startMeridiem)
    const endComp = parseTimeComponents(rawEnd, endMeridiem)

    if (startComp && endComp) {
      startHour = startComp.hour
      startMin = startComp.minute
      endHour = endComp.hour
      endMin = endComp.minute
      timeExtracted = true
      workingText = workingText.replace(rangeMatch[0], ' ').trim()
      confidence += 0.2
    }
  }

  // Pattern B: Prefixed Single time e.g. "at 7:00 PM", "at 7pm", "by 8am", "starts at 3pm"
  if (!timeExtracted) {
    const singleTimeRegex = /(?:at|by|starts\s+at|around)\s+(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?)/i
    const singleMatch = workingText.match(singleTimeRegex)
    if (singleMatch) {
      const comp = parseTimeComponents(singleMatch[1])
      if (comp) {
        startHour = comp.hour
        startMin = comp.minute
        endHour = (startHour + 1) % 24
        endMin = startMin
        timeExtracted = true
        workingText = workingText.replace(singleMatch[0], ' ').trim()
        confidence += 0.15
      }
    }
  }

  // Pattern C: Standalone Single time e.g. "6:30pm", "2pm", "9am", "7:00 PM"
  if (!timeExtracted) {
    const standaloneTimeRegex = /\b(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?)\b/i
    const standaloneMatch = workingText.match(standaloneTimeRegex)
    if (standaloneMatch) {
      const comp = parseTimeComponents(standaloneMatch[1])
      if (comp) {
        startHour = comp.hour
        startMin = comp.minute
        endHour = (startHour + 1) % 24
        endMin = startMin
        timeExtracted = true
        workingText = workingText.replace(standaloneMatch[0], ' ').trim()
        confidence += 0.15
      }
    }
  }

  // Pattern D: Direct named slot keywords (morning, midday, afternoon, evening, noon, midnight)
  if (!timeExtracted) {
    const lower = workingText.toLowerCase()
    if (/\b(?:in the\s+)?morning\b/.test(lower)) {
      startHour = 9; startMin = 0; endHour = 10; endMin = 0; timeExtracted = true; quickSlot = 'morning'
      workingText = workingText.replace(/\b(?:in the\s+)?morning\b/gi, ' ').trim()
    } else if (/\b(?:at\s+)?noon\b/.test(lower) || /\bmidday\b/.test(lower)) {
      startHour = 12; startMin = 0; endHour = 13; endMin = 0; timeExtracted = true; quickSlot = 'midday'
      workingText = workingText.replace(/\b(?:at\s+)?noon\b|\bmidday\b/gi, ' ').trim()
    } else if (/\b(?:in the\s+)?afternoon\b/.test(lower)) {
      startHour = 15; startMin = 30; endHour = 16; endMin = 30; timeExtracted = true; quickSlot = 'afternoon'
      workingText = workingText.replace(/\b(?:in the\s+)?afternoon\b/gi, ' ').trim()
    } else if (/\b(?:in the\s+)?evening\b/.test(lower) || /\btonight\b/.test(lower)) {
      startHour = 18; startMin = 30; endHour = 19; endMin = 30; timeExtracted = true; quickSlot = 'evening'
      workingText = workingText.replace(/\b(?:in the\s+)?evening\b|\btonight\b/gi, ' ').trim()
    }
  }

  // Assign nearest quick slot if matched
  if (timeExtracted && !quickSlot) {
    if (startHour === 9 && startMin === 0) quickSlot = 'morning'
    else if (startHour === 12 && startMin === 0) quickSlot = 'midday'
    else if (startHour === 15 && startMin === 30) quickSlot = 'afternoon'
    else if (startHour === 18 && startMin === 30) quickSlot = 'evening'
  }

  const startDate = setMinutes(setHours(targetDate, startHour), startMin)
  let endDate = setMinutes(setHours(targetDate, endHour), endMin)
  if (endDate <= startDate) {
    endDate = addHours(startDate, 1)
  }

  // 5. Match Location & Saved Places
  let matchedPlaceName: string | null = null
  let rawLocation: string | null = null

  // Check saved places first
  for (const place of places) {
    const placeRegex = new RegExp(`\\b${place.name}\\b`, 'i')
    if (placeRegex.test(workingText)) {
      matchedPlaceName = place.name
      rawLocation = place.name
      confidence += 0.15
      break
    }
  }

  // If no saved place matched, look for prepositional location phrases: "at the gym", "at Dental Care", "to the park"
  if (!rawLocation) {
    const locMatch = workingText.match(/\b(?:at|to)\s+(?:the\s+)?([a-zA-Z0-9\s'#&-]+?)(?:\s+(?:with|for|about)|$)/i)
    if (locMatch && locMatch[1].trim().length > 1) {
      rawLocation = locMatch[1].trim()
      confidence += 0.1
    }
  }

  // 6. Clean Title
  let title = workingText
    .replace(/\b(?:is\s+going\s+to|is\s+having|has\s+a|has\s+an)\b/i, 'going to')
    .replace(/\b(?:at|in|on|with|for)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (title.length > 0) {
    title = title.charAt(0).toUpperCase() + title.slice(1)
  } else {
    title = eventType === 'reminder' ? 'Reminder' : (rawLocation ? `Visit ${rawLocation}` : 'Event')
  }

  return {
    eventType,
    title,
    startDate,
    endDate,
    startDT: toLocalDTString(startDate),
    endDT: toLocalDTString(endDate),
    allDay: false,
    matchedMemberIds,
    matchedPlaceName,
    rawLocation,
    quickSlot,
    confidence: Math.min(1, confidence),
  }
}
