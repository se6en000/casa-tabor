import { addDays, addHours, setHours, setMinutes, setSeconds, setMilliseconds, startOfDay, getDay } from 'date-fns'

export type CaptureIntent = 'event' | 'reminder' | 'grocery'

export interface ParsedCaptureResult {
  rawQuery: string
  title: string
  intent: CaptureIntent
  startDate: Date | null
  endDate: Date | null
  allDay: boolean
  matchedMembers: Array<{ id?: string; name: string; color_hex?: string }>
  matchedPlace: string | null
  detectedDateLabel: string | null
  detectedTimeLabel: string | null
}

export interface ParseOptions {
  now?: Date
  familyMembers?: Array<{ id?: string; name: string; color_hex?: string }>
}

const DAY_NAMES: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
}

export function parseNaturalLanguageCapture(
  query: string,
  options: ParseOptions = {}
): ParsedCaptureResult {
  const rawQuery = (query || '').trim()
  const now = options.now ? new Date(options.now) : new Date()
  const family = options.familyMembers || []

  if (!rawQuery) {
    return {
      rawQuery: '',
      title: '',
      intent: 'event',
      startDate: null,
      endDate: null,
      allDay: false,
      matchedMembers: [],
      matchedPlace: null,
      detectedDateLabel: null,
      detectedTimeLabel: null,
    }
  }

  let working = rawQuery
  let detectedDate: Date | null = null
  let detectedDateLabel: string | null = null
  let detectedTimeLabel: string | null = null
  let isExplicitTime = false
  let isAllDay = false
  let matchedPlace: string | null = null

  // 1. Identify Grocery Intent first if query explicitly starts with grocery triggers
  const groceryMatch = /^(buy|purchase|add to (grocery|shopping|groceries)( list)?)\s+/i.exec(working)
  const isExplicitGrocery = Boolean(groceryMatch)

  // 2. Extract Location ("at <Place>")
  const atPlaceMatch = /\s+at\s+([A-Z][a-zA-Z0-9\s'.-]+?)(?=(\s+(on|for|with|this|next|tomorrow|today|at\s+\d)|\s*$))/i.exec(working)
  if (atPlaceMatch && !/^\d/i.test(atPlaceMatch[1].trim()) && !/^(noon|midnight|morning|afternoon|evening|night)$/i.test(atPlaceMatch[1].trim())) {
    const candidatePlace = atPlaceMatch[1].trim()
    if (!['home', 'school'].includes(candidatePlace.toLowerCase()) || candidatePlace.length > 2) {
      matchedPlace = candidatePlace
      working = working.replace(atPlaceMatch[0], ' ')
    }
  }

  // 3. Extract Family Members
  const matchedMembers: Array<{ id?: string; name: string; color_hex?: string }> = []
  for (const member of family) {
    const nameRegex = new RegExp(`\\b(for|with|and)?\\s*(${member.name})\\b`, 'i')
    if (nameRegex.test(working)) {
      matchedMembers.push(member)
    }
  }

  // 4. Extract Date References
  // 4a. "today" / "tonight"
  if (/\btonight\b/i.test(working)) {
    detectedDate = startOfDay(now)
    detectedDateLabel = 'Tonight'
    working = working.replace(/\btonight\b/i, ' ')
  } else if (/\btoday\b/i.test(working)) {
    detectedDate = startOfDay(now)
    detectedDateLabel = 'Today'
    working = working.replace(/\btoday\b/i, ' ')
  }

  // 4b. "tomorrow"
  if (/\btomorrow\b/i.test(working)) {
    detectedDate = startOfDay(addDays(now, 1))
    detectedDateLabel = 'Tomorrow'
    working = working.replace(/\btomorrow\b/i, ' ')
  }

  // 4c. "in X days / in X hours"
  const inDaysMatch = /\bin\s+(\d+)\s+days?\b/i.exec(working)
  if (inDaysMatch) {
    const count = parseInt(inDaysMatch[1], 10)
    detectedDate = startOfDay(addDays(now, count))
    detectedDateLabel = `In ${count} days`
    working = working.replace(inDaysMatch[0], ' ')
  }

  // 4d. Named Days of Week ("this Friday", "next Monday", "on Tuesday", "Friday")
  for (const [dayName, targetDayNum] of Object.entries(DAY_NAMES)) {
    const dayRegex = new RegExp(`\\b(on\\s+|this\\s+|next\\s+)?(${dayName})\\b`, 'i')
    const dayMatch = dayRegex.exec(working)
    if (dayMatch) {
      const isNext = (dayMatch[1] || '').toLowerCase().includes('next')
      const currentDay = getDay(now)
      let diff = targetDayNum - currentDay
      if (diff <= 0) diff += 7
      if (isNext && diff < 7) diff += 7

      detectedDate = startOfDay(addDays(now, diff))
      detectedDateLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1)
      working = working.replace(dayMatch[0], ' ')
      break
    }
  }

  // 5. Extract Time of Day or Specific Time
  // 5a. Explicit time with "at 9am", "at 4:30pm", "9:00 AM", "3pm", etc.
  const timeRegex = /(?:\bat\s+)?(\b\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i
  const timeMatch = timeRegex.exec(working)

  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10)
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0
    const meridian = timeMatch[3].toLowerCase()

    if (meridian === 'pm' && hours < 12) hours += 12
    if (meridian === 'am' && hours === 12) hours = 0

    if (!detectedDate) {
      detectedDate = startOfDay(now)
      detectedDateLabel = 'Today'
    }

    detectedDate = setSeconds(setMinutes(setHours(detectedDate, hours), minutes), 0)
    detectedDate = setMilliseconds(detectedDate, 0)
    detectedTimeLabel = `${timeMatch[1]}${timeMatch[2] ? `:${timeMatch[2]}` : ''} ${meridian.toUpperCase()}`
    isExplicitTime = true
    working = working.replace(timeMatch[0], ' ')
  } else {
    // 5b. Time of day slots: "morning", "afternoon", "evening", "night", "noon"
    if (/\bmorning\b/i.test(working)) {
      if (!detectedDate) detectedDate = startOfDay(addDays(now, 1))
      detectedDate = setSeconds(setMinutes(setHours(detectedDate, 9), 0), 0)
      detectedTimeLabel = '9:00 AM'
      isExplicitTime = true
      working = working.replace(/\bmorning\b/i, ' ')
    } else if (/\bafternoon\b/i.test(working)) {
      if (!detectedDate) detectedDate = startOfDay(now)
      detectedDate = setSeconds(setMinutes(setHours(detectedDate, 14), 0), 0)
      detectedTimeLabel = '2:00 PM'
      isExplicitTime = true
      working = working.replace(/\bafternoon\b/i, ' ')
    } else if (/\bevening\b/i.test(working)) {
      if (!detectedDate) detectedDate = startOfDay(now)
      detectedDate = setSeconds(setMinutes(setHours(detectedDate, 18), 0), 0)
      detectedTimeLabel = '6:00 PM'
      isExplicitTime = true
      working = working.replace(/\bevening\b/i, ' ')
    } else if (/\bnight\b/i.test(working)) {
      if (!detectedDate) detectedDate = startOfDay(now)
      detectedDate = setSeconds(setMinutes(setHours(detectedDate, 20), 0), 0)
      detectedTimeLabel = '8:00 PM'
      isExplicitTime = true
      working = working.replace(/\bnight\b/i, ' ')
    } else if (/\bnoon\b/i.test(working)) {
      if (!detectedDate) detectedDate = startOfDay(now)
      detectedDate = setSeconds(setMinutes(setHours(detectedDate, 12), 0), 0)
      detectedTimeLabel = '12:00 PM'
      isExplicitTime = true
      working = working.replace(/\bnoon\b/i, ' ')
    }
  }

  // 6. Clean up working title string
  let title = working
    .replace(/\b(create (an? )?event( to)?|schedule( an?)?|add( a)? reminder( to)?|remind me to|reminder:?)\b/gi, '')
    .replace(/\b(for|with)\s+([A-Z][a-z]+)\b/g, (match, _p1, p2) => {
      if (family.some((f) => f.name.toLowerCase() === p2.toLowerCase())) {
        return ''
      }
      return match
    })
    .replace(/\s+/g, ' ')
    .trim()

  if (isExplicitGrocery && groceryMatch) {
    title = rawQuery.replace(groceryMatch[0], '').trim()
  }

  // Capitalize first letter of title
  if (title.length > 0) {
    title = title.charAt(0).toUpperCase() + title.slice(1)
  } else {
    title = rawQuery
  }

  // 7. Intent classification
  let intent: CaptureIntent = 'event'
  if (isExplicitGrocery) {
    intent = 'grocery'
  } else if (!isExplicitTime) {
    const isChore = /\b(pick up|drop off|dry cleaning|clean|pack|call|pay|water|take out|buy|check|finish|order)\b/i.test(rawQuery)
    if (isChore || /\bremind(er)?\b/i.test(rawQuery)) {
      intent = 'reminder'
      isAllDay = true
    }
  }

  // Start & End date construction
  let startDate: Date | null = null
  let endDate: Date | null = null

  if (detectedDate) {
    startDate = detectedDate
    if (isAllDay) {
      endDate = startOfDay(detectedDate)
    } else {
      endDate = addHours(startDate, 1)
    }
  } else {
    // Default fallback to now snapped to next hour
    startDate = addHours(startOfDay(now), now.getHours() + 1)
    endDate = addHours(startDate, 1)
  }

  return {
    rawQuery,
    title: title || rawQuery,
    intent,
    startDate,
    endDate,
    allDay: isAllDay,
    matchedMembers,
    matchedPlace,
    detectedDateLabel,
    detectedTimeLabel,
  }
}
