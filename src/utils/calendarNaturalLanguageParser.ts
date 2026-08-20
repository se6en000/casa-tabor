import { addDays, nextDay, setHours, setMinutes, startOfDay, format } from 'date-fns'
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
  summaryText: string
  timeLabel: string
  dateLabel: string
  attendeesLabel: string
  locationLabel: string
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

const MEMBER_PHONETIC_ALIASES: Record<string, string[]> = {
  liv: ['live', 'olivia', 'livy', 'livvy', 'lyv'],
  emme: ['emma', 'emmie', 'em', 'emi'],
  jake: ['jacob', 'jakes', "jake's"],
  kelly: ['kelli', 'kellie', 'kel', "kelly's"],
  owen: ['owan', 'owens', "owen's"],
  giselle: ['gisela', 'gigi', 'gisele', 'gizelle', "giselle's"],
  milo: ['mylo', "milo's"],
  tabor: ['tabors', 'the family', 'family', 'tabor family'],
}

const ACTION_VERB_TITLE_MAP: Record<string, string> = {
  babysit: 'Babysitting',
  babysitting: 'Babysitting',
  pickleball: 'Pickleball',
  tennis: 'Tennis',
  swim: 'Swim Practice',
  swimming: 'Swim Practice',
  soccer: 'Soccer',
  baseball: 'Baseball',
  dentist: 'Dentist Appointment',
  doctor: 'Doctor Appointment',
  haircut: 'Haircut',
  dinner: 'Dinner',
  lunch: 'Lunch',
  breakfast: 'Breakfast',
  brunch: 'Brunch',
  coffee: 'Coffee',
  tutoring: 'Tutoring',
  tutor: 'Tutoring',
  piano: 'Piano Lesson',
  guitar: 'Guitar Lesson',
  golf: 'Golf',
  gym: 'Workout',
  workout: 'Workout',
}

function normalizeTight(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '')
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
      summaryText: '',
      timeLabel: '9:00 AM',
      dateLabel: 'Today',
      attendeesLabel: '',
      locationLabel: '',
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

  // 2. Strip conversational scheduling filler verbs & intents
  text = text.replace(/^(?:an?\s+appointment\s+(?:to\s+(?:go\s+)?(?:play\s+|do\s+|see\s+)?|for\s+)?|appointment\s+(?:to\s+(?:go\s+)?(?:play\s+|do\s+|see\s+)?|for\s+)?|i\s+have\s+(?:an?\s+)?(?:appointment\s+(?:to|for)\s+)?|i\s+need\s+to\s+(?:go\s+)?(?:play\s+|do\s+|see\s+)?|we\s+have\s+(?:an?\s+)?|schedule\s+(?:an?\s+)?(?:appointment\s+(?:to|for)\s+)?|add\s+(?:an?\s+)?(?:appointment\s+(?:to|for)\s+)?|book\s+(?:an?\s+)?(?:appointment\s+(?:to|for)\s+)?|create\s+(?:an?\s+)?(?:appointment\s+(?:to|for)\s+)?|plan\s+(?:an?\s+)?|set\s+up\s+(?:an?\s+)?(?:appointment\s+(?:to|for)\s+)?|put\s+(?:on\s+the\s+calendar|on\s+my\s+calendar)\s+|going\s+to\s+(?:play\s+)?|go\s+to\s+(?:play\s+)?|go\s+play\s+|to\s+go\s+play\s+|to\s+play\s+)/i, '')

  // 3. Detect All-Day flag
  let allDay = false
  if (/\b(all\s+day|all-day)\b/i.test(text)) {
    allDay = true
    matchedDetailsCount++
    text = text.replace(/\b(all\s+day|all-day)\b/i, '')
  }

  // 4. Match Family Members (Attendees) with Phonetic & STT Aliases
  const matchedMemberIds: string[] = []
  const matchedMemberNames: string[] = []

  for (const member of familyMembers) {
    if (!member.name) continue
    const baseName = member.name.toLowerCase()
    const allAliases = [
      baseName,
      ...(MEMBER_PHONETIC_ALIASES[baseName] || []),
    ]

    for (const alias of allAliases) {
      // Check if alias exists in text (including "[Alias] needs to..." or "with [Alias]")
      const aliasPattern = new RegExp(`\\b${alias}\\b`, 'i')
      if (aliasPattern.test(text)) {
        if (!matchedMemberIds.includes(member.id)) {
          matchedMemberIds.push(member.id)
          matchedMemberNames.push(member.name)
        }
        // Clean from text: "with [Alias]", "for [Alias]", "[Alias] needs to", "[Alias] has to", "[Alias] is"
        text = text.replace(new RegExp(`\\b(?:with|for|and)\\s+${alias}\\b`, 'gi'), '')
        text = text.replace(new RegExp(`\\b${alias}\\s+(?:needs?\\s+to|has\\s+to|is|will)\\s*`, 'gi'), '')
        text = text.replace(new RegExp(`\\b${alias}\\b`, 'gi'), '')
        break
      }
    }
  }

  if (matchedMemberIds.length > 0) {
    matchedDetailsCount += matchedMemberIds.length
  }

  // 5. Match Saved Places (Venues) with Fuzzy Spacing & Phonetic Sound-Alike Matching
  let matchedPlace: SavedPlace | null = null
  let extractedLocationName: string | null = null

  for (const place of savedPlaces) {
    if (!place.name) continue
    const placeTight = normalizeTight(place.name)
    const placeAliasesTight = (place.aliases || []).map(normalizeTight)

    // Build common variations (e.g. springmeyer -> spring myers, spring meyer, springmeyers)
    const candidatesTight = [placeTight, ...placeAliasesTight]
    if (placeTight.includes('meyer')) {
      candidatesTight.push(placeTight.replace(/meyer/g, 'myers'))
      candidatesTight.push(placeTight.replace(/meyer/g, 'meyers'))
      candidatesTight.push(placeTight.replace(/meyer/g, 'meier'))
    }

    // Check direct regex in text
    let matched = false
    const placeRegex = new RegExp(`\\b(?:at\\s+the|at|in|near)?\\s*${place.name}\\b`, 'i')
    if (placeRegex.test(text)) {
      matchedPlace = place
      matchedDetailsCount++
      text = text.replace(placeRegex, '')
      matched = true
    }

    if (!matched && place.aliases && Array.isArray(place.aliases)) {
      for (const alias of place.aliases) {
        if (!alias) continue
        const aliasRegex = new RegExp(`\\b(?:at\\s+the|at|in|near)?\\s*${alias}\\b`, 'i')
        if (aliasRegex.test(text)) {
          matchedPlace = place
          matchedDetailsCount++
          text = text.replace(aliasRegex, '')
          matched = true
          break
        }
      }
    }

    // Fuzzy check for space-separated or STT-mutated venue words (e.g. "at the spring Myers" -> "Springmeyer")
    if (!matched) {
      const atLocationMatch = text.match(/\b(?:at\s+the|at|in|near)\s+([A-Za-z0-9\s'&.-]{3,30}?)(?=\s+(?:at\s+\d|\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|tomorrow|today|this|next|on\s+[A-Za-z]+|for\s+\d)|$)/i)
      if (atLocationMatch && atLocationMatch[1]) {
        const spokenLocTight = normalizeTight(atLocationMatch[1])
        if (candidatesTight.some(c => c === spokenLocTight || (c.length > 5 && spokenLocTight.length > 5 && (c.includes(spokenLocTight) || spokenLocTight.includes(c))))) {
          matchedPlace = place
          matchedDetailsCount++
          text = text.replace(atLocationMatch[0], '')
          matched = true
        }
      }
    }

    if (matchedPlace) break
  }

  // If no saved place matched, check for generic "at [Location Name]"
  if (!matchedPlace) {
    const locMatch = text.match(/\b(?:at\s+the|at|in)\s+([A-Z][A-Za-z0-9\s'&.-]{2,30})(?=\s+(?:tomorrow|today|this|next|on|at\s+\d|\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|for\s+\d)|$)/i)
    if (locMatch && locMatch[1]) {
      const candLoc = locMatch[1].trim()
      if (!/^(morning|afternoon|evening|night|noon|midnight|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(candLoc)) {
        extractedLocationName = candLoc
        matchedDetailsCount++
        text = text.replace(locMatch[0], '')
      }
    }
  }

  // 6. Extract Date
  let targetDate = new Date(contextDate)
  let explicitDateFound = false
  let dateLabel = 'Today'

  if (/\btoday\b/i.test(text)) {
    targetDate = new Date()
    explicitDateFound = true
    dateLabel = 'Today'
    matchedDetailsCount++
    text = text.replace(/\btoday\b/i, '')
  } else if (/\btomorrow\b/i.test(text)) {
    targetDate = addDays(new Date(), 1)
    explicitDateFound = true
    dateLabel = 'Tomorrow'
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
        dateLabel = format(calculated, 'EEE, MMM d')
        matchedDetailsCount++
        text = text.replace(dayMatch[0], '')
      }
    }
  }

  // 7. Extract Duration
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

  // 8. Extract Time (with robust support for p.m., a.m., pm, am, 6pm, 6:00 pm, etc.)
  let startHour = 9
  let startMinute = 0
  let explicitTimeFound = false

  const time12Match = text.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i)
  const time24Match = text.match(/\b(?:at\s+)?(\d{1,2}):(\d{2})\b/i)
  const oclockMatch = text.match(/\b(?:at\s+)?(\d{1,2})\s*o'?clock\b/i)

  if (time12Match) {
    let hour = parseInt(time12Match[1], 10)
    const minute = time12Match[2] ? parseInt(time12Match[2], 10) : 0
    const period = time12Match[3].toLowerCase().replace(/\./g, '')
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

  // 9. Clean residual conversational filler and transform verbs to natural event titles
  let cleanTitle = text
    .replace(/\b(to\s+play|to\s+go|to\s+do|to\s+see|needs?\s+to|has\s+to|have\s+to)\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(at|on|for|with|by|in|and)\s*$/i, '')
    .replace(/^[\s,·\-\/.]+|[\s,·\-\/.]+$/g, '')
    .trim()

  // Map action verbs into clean editorial titles (e.g. "babysit" -> "Babysitting")
  const lowerClean = cleanTitle.toLowerCase()
  if (ACTION_VERB_TITLE_MAP[lowerClean]) {
    cleanTitle = ACTION_VERB_TITLE_MAP[lowerClean]
  } else if (!cleanTitle) {
    cleanTitle = eventType === 'reminder' ? 'Reminder' : 'New Event'
  } else {
    // Capitalize first letter
    cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1)
  }

  // Compute final start and end dates
  const start = setMinutes(setHours(startOfDay(targetDate), startHour), startMinute)
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000)

  // Format human-friendly time and labels
  const timeLabel = allDay
    ? 'All Day'
    : format(start, startMinute === 0 ? 'h:mm a' : 'h:mm a').replace(':00', '')
  const attendeesLabel = matchedMemberNames.join(' & ')
  const locationLabel = matchedPlace ? matchedPlace.name : (extractedLocationName || '')

  // Build crisp glanceable summary
  const summaryParts: string[] = []
  if (allDay) {
    summaryParts.push(dateLabel === 'Today' ? 'All Day Today' : `All Day (${dateLabel})`)
  } else {
    summaryParts.push(`${dateLabel} at ${format(start, 'h:mm a')}`)
  }
  if (attendeesLabel) {
    summaryParts.push(`For ${attendeesLabel}`)
  }
  if (locationLabel) {
    summaryParts.push(`At ${locationLabel}`)
  }

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
    summaryText: summaryParts.join(' · '),
    timeLabel,
    dateLabel,
    attendeesLabel,
    locationLabel,
  }
}


