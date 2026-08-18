import {
  isCanonicalRecurringEvent,
  scopeCanonicalMutation,
} from './assistant-recurring-mutation.mjs'
import { normalizeAssistantSpeechPunctuation } from './assistant-language-normalization.mjs'

const NUMBER_WORDS = new Map([
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
  ['eleven', 11],
  ['twelve', 12],
])

function localTimestamp(date, hour, minute, utcOffset) {
  const offsetMatch = String(utcOffset ?? '').match(/^([+-])(\d{2}):(\d{2})$/)
  if (!offsetMatch) return null
  const offsetMinutes = (offsetMatch[1] === '+' ? 1 : -1) *
    (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]))
  const local = new Date(date.getTime() + offsetMinutes * 60000)
  return Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    hour,
    minute,
  ) - offsetMinutes * 60000
}

function explicitDurationMinutes(input) {
  const duration = input.match(/\bfor\s+(an?\s+hour|(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(hours?|minutes?))\b/i)
  if (!duration) return 60
  if (/^an?\s+hour$/i.test(duration[1])) return 60
  const amount = NUMBER_WORDS.get(duration[2].toLowerCase()) ?? Number(duration[2])
  if (!Number.isFinite(amount) || amount <= 0) return 60
  return amount * (/^hour/i.test(duration[3]) ? 60 : 1)
}

export function resolveDefaultCalendarCreate(text, options = {}) {
  const input = normalizeAssistantSpeechPunctuation(text)
  if (
    !/\b(?:add|create|book|schedule)\b/i.test(input) ||
    !/\b(?:event|appointment|meeting)\b/i.test(input) ||
    /\b(?:today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\/\d{1,2}|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(input)
  ) return null

  const match = input.match(/\b(?:for|at)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to\s+)?(?:go\s+to\s+|visit\s+|attend\s+)?(.+)$/i)
  if (!match) return null
  const hour12 = Number(match[1])
  const minute = Number(match[2] ?? 0)
  if (hour12 < 1 || hour12 > 12 || minute > 59) return null
  const meridiem = match[3]?.toLowerCase() ?? 'am'
  const hour = (hour12 % 12) + (meridiem === 'pm' ? 12 : 0)
  const title = match[4]
    .replace(/^(?:an?\s+)?(?:event|appointment|meeting)\s+(?:for|at)\s+/i, '')
    .replace(/\bfor\s+(?:an?\s+hour|\d+\s+(?:hours?|minutes?))$/i, '')
    .trim()
  if (!title || /^(?:an?\s+)?(?:event|appointment|meeting)$/i.test(title)) return null

  const now = options.now instanceof Date ? options.now : new Date()
  const startMs = localTimestamp(now, hour, minute, options.utcOffset)
  if (!Number.isFinite(startMs)) return null
  const durationMinutes = explicitDurationMinutes(input)
  return {
    tool: 'create_event',
    args: {
      title,
      start: new Date(startMs).toISOString(),
      end: new Date(startMs + durationMinutes * 60000).toISOString(),
      members: [],
      event_type: 'event',
    },
    defaults: {
      date: 'today',
      meridiem: match[3] ? meridiem : 'am',
      duration_minutes: durationMinutes,
    },
  }
}

function durationMs(event) {
  const start = Date.parse(event?.start_time)
  const end = Date.parse(event?.end_time)
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : null
}

function shiftDays(event, days) {
  const duration = durationMs(event)
  if (duration == null) return null
  const start = new Date(Date.parse(event.start_time) + days * 86400000)
  return {
    tool: 'update_event',
    args: {
      id: event.id,
      expected_updated_at: event.updated_at,
      start: start.toISOString(),
      end: new Date(start.getTime() + duration).toISOString(),
    },
    event,
  }
}

function localWeekday(value, utcOffset) {
  const offsetMatch = String(utcOffset ?? '').match(/^([+-])(\d{2}):(\d{2})$/)
  const offset = offsetMatch
    ? (offsetMatch[1] === '+' ? 1 : -1) * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]))
    : 0
  return new Date(Date.parse(value) + offset * 60000).getUTCDay()
}

function localHour(value, utcOffset) {
  const offsetMatch = String(utcOffset ?? '').match(/^([+-])(\d{2}):(\d{2})$/)
  const offset = offsetMatch
    ? (offsetMatch[1] === '+' ? 1 : -1) * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]))
    : 0
  return new Date(Date.parse(value) + offset * 60000).getUTCHours()
}

function overlaps(candidate, events, ignoredId) {
  const start = Date.parse(candidate.start)
  const end = Date.parse(candidate.end)
  return events.filter((event) => (
    event.id !== ignoredId
    && event.all_day !== true
    && Date.parse(event.start_time) < end
    && Date.parse(event.end_time) > start
  ))
}

function parseDeleteSelectionRequest(value) {
  const input = normalizeAssistantSpeechPunctuation(value)
  const match = input.match(
    /^(?:delete|cancel|remove)\s+(?:the\s+)?(.+?)(?:\s+(?:on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday))?[.!]?$/i,
  )
  if (!match) return null
  const queryTokens = match[1]
    .toLowerCase()
    .replace(/\bapts?\b/g, 'appointment')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !['the', 'event', 'appointment', 'calendar'].includes(token))
  if (queryTokens.length === 0) return null
  return {
    queryTokens,
    weekday: match[2]
      ? ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(match[2].toLowerCase())
      : null,
  }
}

function deleteSelectionMatches(request, events, utcOffset) {
  return events.filter((event) => (
    (request.weekday == null || localWeekday(event.start_time, utcOffset) === request.weekday)
    && request.queryTokens.every((token) => String(event.title ?? '').toLowerCase().includes(token))
  ))
}

export function findTargetEventFromText(text, events, options = {}) {
  if (!text || !Array.isArray(events) || events.length === 0) return null
  const input = normalizeAssistantSpeechPunctuation(text).toLowerCase()

  // 1. Exact / Full title match
  const exactTitleMatches = events.filter((e) => {
    if (!e.title) return false
    const title = String(e.title).toLowerCase().trim()
    return title.length >= 3 && input.includes(title)
  })
  if (exactTitleMatches.length === 1) return exactTitleMatches[0]
  if (exactTitleMatches.length > 1) {
    return exactTitleMatches.sort((a, b) => (b.title?.length ?? 0) - (a.title?.length ?? 0))[0]
  }

  // 2. Keyword token matching (ignore generic stopwords and intent words)
  const stopWords = new Set([
    'change', 'update', 'driver', 'driving', 'attendee', 'attendees', 'primary',
    'category', 'location', 'venue', 'address', 'checklist', 'notes', 'bring',
    'water', 'bottle', 'guards', 'hours', 'before', 'visit', 'please', 'today',
    'tomorrow', 'event', 'appointment', 'meeting', 'reminder', 'schedule', 'time',
    'with', 'from', 'into', 'also', 'that', 'this', 'will', 'have', 'been',
  ])

  const tokens = input
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !stopWords.has(t))

  if (tokens.length > 0) {
    const tokenMatches = events.filter((e) => {
      const eTitle = String(e.title ?? '').toLowerCase()
      return tokens.some((token) => eTitle.includes(token))
    })
    if (tokenMatches.length === 1) return tokenMatches[0]
  }

  return null
}

export function resolveActiveCalendarMutation(text, event, events, options = {}) {
  if (!event?.id) return null
  const input = normalizeAssistantSpeechPunctuation(text)
  const activeDeleteRequest = /^(?:delete|cancel|remove)\s+(?:it|this|that|this one|that one|the one)(?:[,;]?\s+(?:(?:for\s+)?(?:just|only)\s+(?:this|that|the)\s+(?:event|appointment|occurrence|one)|(?:for\s+)?(?:this|the)\s+(?:event|appointment|occurrence|one)\s+and\s+(?:all\s+)?(?:future|following|later|upcoming)\s*(?:events|appointments|occurrences|ones)?|(?:for\s+)?(?:all|every)\s+(?:event|appointment|occurrence|one)(?:\s+in\s+(?:the|this)\s+series)?|(?:for\s+)?(?:the\s+)?(?:entire|whole)\s+series))?[.!]?$/i.test(input)

  if (isCanonicalRecurringEvent(event)) {
    const standaloneView = {
      ...event,
      series_id: null,
      record_kind: 'standalone',
      recurrence_master_id: null,
      rrule: null,
    }
    const mutation = resolveActiveCalendarMutation(input, standaloneView, events, options)
    return scopeCanonicalMutation(input, mutation, event)
  }

  if (event.rrule || event.recurrence_master_id) {
    if (
      activeDeleteRequest
      ||
      /\b(?:move|reschedule|shift|change|update|edit)\b/i.test(input)
      || /^(?:just\s+)?(?:that|this|the)\s+one[.!]?$/i.test(input)
    ) {
      return {
        text: 'This is a recurring event. AI editing cannot safely choose one occurrence, future events, or the whole series yet. Please use the event editor.',
        event,
      }
    }
  }

  if (activeDeleteRequest) {
    return {
      tool: 'delete_event',
      args: {
        id: event.id,
        title: event.title,
      },
      event,
    }
  }

  // Location / Venue removal
  const clearLocationMatch = /^(?:clear|remove|delete)\s+(?:the\s+)?(?:location|venue|address|place)[.!?]?$/i.test(input) ||
    /^(?:set\s+(?:the\s+)?(?:location|venue|address|place)\s+to\s+(?:none|empty|nothing)|no\s+location)[.!?]?$/i.test(input)
  if (clearLocationMatch) {
    return {
      tool: 'update_event',
      args: {
        id: event.id,
        expected_updated_at: event.updated_at,
        location: '',
        address: '',
      },
      event,
    }
  }

  // Incomplete location slot request (conversational prompt)
  const incompleteLocation = /^(?:please\s+)?(?:change|update|set|edit|move|switch)\s+(?:the\s+)?(?:location|venue|address|place)[.!?]?$/i.test(input)
  if (incompleteLocation) {
    return {
      text: `Where would you like to set the location for "${event.title}"?`,
      event,
    }
  }

  // Exploratory capability inquiry
  const exploratoryInquiry = /^(?:update|edit|change)\s+(?:details|event|info|this)\??$/i.test(input) ||
    /^what\s+can\s+(?:i|we)\s+(?:change|update|edit)\??$/i.test(input) ||
    /^(?:help\s+with\s+)?(?:editing|updating)\??$/i.test(input)
  if (exploratoryInquiry) {
    return {
      text: `You can update the time, location, assigned driver, attendees, or prep notes for "${event.title}". What would you like to change?`,
      event,
    }
  }

  // Explicit Location / Venue update
  const explicitNamedLocation = input.match(
    /^(?:please\s+)?(?:update|change|set|make|move|switch|put)\s+(?:the\s+)?(?:location|venue|address|place)\s+(?:(?:to|at|as|for)\s+)?(.+?)[.!?]?$/i,
  ) || input.match(
    /^(?:the\s+)?(?:location|venue|address|place)\s+is\s+(.+?)[.!?]?$/i,
  ) || input.match(
    /^(?:relocate|move\s+venue)\s+(?:to\s+)?(.+?)[.!?]?$/i,
  )

  const meetingAtLocation = input.match(
    /^(?:(?:it's|its|we're|we\s+are|we\s+will\s+be)\s+)?(?:meeting|located|actually)?\s*(?:at|in)\s+(.+?)[.!?]?$/i,
  )

  const candidateLocationMatch = explicitNamedLocation ?? meetingAtLocation
  if (candidateLocationMatch) {
    const rawDest = candidateLocationMatch[1].trim()
    const isTemporal = /\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|noon|midnight)\b/i.test(rawDest) && !explicitNamedLocation
    if (!isTemporal && rawDest.length > 0 && !/^(?:the\s+)?(?:location|venue|address|place)$/i.test(rawDest)) {
      return {
        tool: 'update_event',
        args: {
          id: event.id,
          expected_updated_at: event.updated_at,
          location: rawDest,
        },
        event,
      }
    }
  }

  // Renaming / Title
  const incompleteRename = /^(?:please\s+)?(?:rename(?:\s+the)?(?:\s+event|\s+this|\s+appointment)?|change\s+(?:the\s+)?(?:title|name))[.!?]?$/i.test(input)
  if (incompleteRename) {
    return {
      text: `What would you like to rename "${event.title}" to?`,
      event,
    }
  }

  const explicitRename = input.match(
    /^(?:please\s+)?(?:rename|change\s+(?:the\s+)?(?:name|title)|set\s+(?:the\s+)?(?:name|title))\s+(?:(?:of|for)\s+(?:this\s+)?(?:event|appointment)\s+)?(?:to|as)\s+(.+?)[.!?]?$/i,
  ) || input.match(
    /^(?:please\s+)?rename\s+(?:(.+?)\s+)?to\s+(.+?)[.!?]?$/i,
  ) || input.match(
    /^rename\s+(?:to\s+)?(.+?)[.!?]?$/i,
  )
  if (explicitRename && !/\b(?:driver|location|venue|category|what\s+to\s+bring)\b/i.test(input)) {
    const rawTitle = (explicitRename[2] ?? explicitRename[1]).trim().replace(/^["']|["']$/g, '')
    if (rawTitle.length > 0 && !/^(?:the\s+)?(?:event|appointment|this)$/i.test(rawTitle)) {
      return {
        tool: 'update_event',
        args: {
          id: event.id,
          expected_updated_at: event.updated_at,
          title: rawTitle,
        },
        event,
      }
    }
  }

  // Category & Tagging
  const CATEGORY_MAP = {
    medical: 'medical', doctor: 'medical', health: 'medical', pediatric: 'medical', pediatrics: 'medical',
    dentist: 'medical', orthodontic: 'medical', orthodontics: 'medical', prescription: 'medical', pharmacy: 'medical',
    school: 'school', class: 'school', education: 'school', strings: 'school', band: 'school', orchestra: 'school',
    sports: 'sports', sport: 'sports', soccer: 'sports', football: 'sports', basketball: 'sports', baseball: 'sports',
    swimming: 'sports', practice: 'sports', game: 'sports', match: 'sports', gym: 'sports',
    dining: 'dining', dinner: 'dining', lunch: 'dining', breakfast: 'dining', brunch: 'dining', restaurant: 'dining', food: 'dining',
    home_maintenance: 'home_maintenance', maintenance: 'home_maintenance', home: 'home_maintenance', chore: 'home_maintenance', chores: 'home_maintenance', repair: 'home_maintenance',
    social: 'social', party: 'social', playdate: 'social', hangout: 'social',
    work: 'work', job: 'work', office: 'work',
    errand: 'errand', errands: 'errand', shopping: 'errand', grocery: 'errand', groceries: 'errand',
    child_care: 'child_care', childcare: 'child_care', daycare: 'child_care', babysitting: 'child_care',
    birthday: 'birthday', bday: 'birthday',
    travel: 'travel', trip: 'travel', flight: 'travel', vacation: 'travel',
    holiday: 'holiday',
    appointment: 'appointment',
  }

  const categoryMatch = input.match(
    /^(?:please\s+)?(?:change|set|update|make)\s+(?:the\s+)?category\s+(?:to|as)\s+([a-z_\s]+)[.!?]?$/i,
  ) || input.match(
    /^(?:tag|mark)\s+(?:(?:this|the)\s+)?(?:.+?\s+)?as\s+([a-z_\s]+)[.!?]?$/i,
  ) || input.match(
    /^(?:tag|mark)\s+(?:this\s+)?([a-z_\s]+)[.!?]?$/i,
  ) || input.match(
    /^(?:it's|its|make\s+it|it\s+is)\s+(?:a|an)?\s*(medical|sports|school|social|work|errand|dining|travel|birthday|home\s+maintenance)\s*(?:event|appointment|category)?[.!?]?$/i,
  )
  if (categoryMatch) {
    const rawCat = categoryMatch[1].trim().toLowerCase().replace(/\s+/g, '_')
    const mapped = CATEGORY_MAP[rawCat]
    if (mapped) {
      return {
        tool: 'update_event',
        args: {
          id: event.id,
          expected_updated_at: event.updated_at,
          category: mapped,
        },
        event,
      }
    }
  }

  const incompleteCategory = /^(?:please\s+)?(?:change|update|set)\s+(?:the\s+)?category[.!?]?$/i.test(input)
  if (incompleteCategory) {
    return {
      text: `What category would you like to set for "${event.title}" (e.g. School, Sports, Medical, Social, Work, Errand)?`,
      event,
    }
  }

  // Travel behavior modes
  if (/^(?:wait\s+there|wait\s+on\s+site|stay\s+on\s+site|stay\s+there|staying)[.!?]?$/i.test(input)) {
    return {
      tool: 'update_event',
      args: {
        id: event.id,
        expected_updated_at: event.updated_at,
        travel_behavior: 'stay',
      },
      event,
    }
  }
  if (/^(?:two\s+way|2\s+way|come\s+back(?:\s+home)?\s+(?:and|to)\s+pick\s+up\s+later|separate\s+trips)[.!?]?$/i.test(input)) {
    return {
      tool: 'update_event',
      args: {
        id: event.id,
        expected_updated_at: event.updated_at,
        travel_behavior: 'two_way',
      },
      event,
    }
  }
  if (/^(?:drop\s*off\s+only|just\s+drop(?:ping)?\s+off|only\s+drop(?:ping)?\s+off)[.!?]?$/i.test(input)) {
    return {
      tool: 'update_event',
      args: {
        id: event.id,
        expected_updated_at: event.updated_at,
        travel_behavior: 'dropoff_only',
      },
      event,
    }
  }
  if (/^(?:pick\s*up\s+only|just\s+pick(?:ing)?\s+up|only\s+pick(?:ing)?\s+up)[.!?]?$/i.test(input)) {
    return {
      tool: 'update_event',
      args: {
        id: event.id,
        expected_updated_at: event.updated_at,
        travel_behavior: 'pickup_only',
      },
      event,
    }
  }
  if (/^(?:no\s+driving(?:\s+needed)?|no\s+ride(?:\s+needed)?|virtual|online|walking)[.!?]?$/i.test(input)) {
    return {
      tool: 'update_event',
      args: {
        id: event.id,
        expected_updated_at: event.updated_at,
        travel_behavior: 'none',
      },
      event,
    }
  }

  // Clear driver
  if (/^(?:clear|remove|delete)\s+(?:the\s+)?driver[.!?]?$/i.test(input) || /^(?:no\s+driver|unassigned\s+driver)[.!?]?$/i.test(input)) {
    return {
      tool: 'update_event',
      args: {
        id: event.id,
        expected_updated_at: event.updated_at,
        driver_name: '',
      },
      event,
    }
  }

  // Incomplete driver prompt
  if (/^(?:please\s+)?(?:change|update|set|switch|assign)\s+(?:the\s+)?driver[.!?]?$/i.test(input) || /^who\s+is\s+driving\??$/i.test(input)) {
    return {
      text: `Who should be assigned as the driver for "${event.title}"?`,
      event,
    }
  }

  // Split drivers: "Jake will drop off and Kelly pick up"
  const splitDriversMatch = input.match(
    /^([a-z][a-z'-]*)\s+(?:will\s+|is\s+)?(?:doing\s+)?(?:drop\s*off|dropoff|drops?\s*off)\s+(?:and\s+|,)?\s*([a-z][a-z'-]*)\s+(?:will\s+|is\s+)?(?:doing\s+)?(?:pick\s*up|pickup|picks?\s*up)[.!?]?$/i,
  )
  if (splitDriversMatch) {
    const d1 = splitDriversMatch[1]
    const d2 = splitDriversMatch[2]
    return {
      tool: 'update_event',
      args: {
        id: event.id,
        expected_updated_at: event.updated_at,
        driver_leg1: d1.charAt(0).toUpperCase() + d1.slice(1).toLowerCase(),
        driver_leg2: d2.charAt(0).toUpperCase() + d2.slice(1).toLowerCase(),
      },
      event,
    }
  }

  // Single driver assignment: "Kelly is driving", "assign driver to Jake", "switch driver to Kelly"
  const singleDriverMatch = input.match(
    /^(?:please\s+)?(?:set|assign|change|switch|make)\s+(?:the\s+)?driver\s+(?:to|as)\s+([a-z][a-z'-]*)(?:\s+(?:for|to)\s+.+)?$/i,
  ) || input.match(
    /^([a-z][a-z'-]*)\s+(?:is\s+driving|will\s+drive|is\s+the\s+driver|drives)(?:\s+(?:for|to)\s+.+)?$/i,
  )
  if (singleDriverMatch && !/\b(?:to|at|in|on)\b/i.test(singleDriverMatch[1])) {
    const rawDriver = singleDriverMatch[1].trim()
    const capDriver = rawDriver.charAt(0).toUpperCase() + rawDriver.slice(1).toLowerCase()
    return {
      tool: 'update_event',
      args: {
        id: event.id,
        expected_updated_at: event.updated_at,
        driver_name: capDriver,
      },
      event,
    }
  }

  // Attendee removal: "remove Jake", "remove Jake from attendees"
  const removeAttendeeMatch = input.match(
    /^(?:please\s+)?(?:remove|delete)\s+(.+?)(?:\s+from\s+(?:the\s+)?(?:event|attendees?|appointment))?[.!?]?$/i,
  )
  if (removeAttendeeMatch && !/\b(?:location|venue|address|driver|what\s+to\s+bring|checklist|notes?)\b/i.test(input)) {
    const rawNames = removeAttendeeMatch[1]
      .split(/\s*(?:,|&|\band\b|\+)\s*/i)
      .map(s => s.trim())
      .filter(Boolean)
    const validNames = Array.isArray(options.familyNames)
      ? rawNames.map(r => options.familyNames.find(n => n.toLowerCase() === r.toLowerCase())).filter(Boolean)
      : rawNames
    if (validNames.length > 0) {
      return {
        tool: 'update_event',
        args: {
          id: event.id,
          expected_updated_at: event.updated_at,
          members_remove: validNames,
        },
        event,
      }
    }
  }

  // Primary attendee: "this is for Emme", "primary attendee is Liv"
  const primaryAttendeeMatch = input.match(
    /^(?:this\s+is\s+for|for|primary\s+attendee\s+is|primary\s+is)\s+([a-z][a-z'-]*)[.!?]?$/i,
  )
  if (primaryAttendeeMatch && Array.isArray(options.familyNames)) {
    const name = primaryAttendeeMatch[1].toLowerCase()
    const member = options.familyNames.find(n => n.toLowerCase() === name)
    if (member) {
      return {
        tool: 'update_event',
        args: {
          id: event.id,
          expected_updated_at: event.updated_at,
          members_add: [member],
          primary_attendee: member,
        },
        event,
      }
    }
  }

  // Multiple / Single Attendee Addition: "add Owen and Liv", "add Kelly too"
  const addAttendeeMatch = input.match(
    /^(?:please\s+)?add\s+(.+?)(?:\s+too|\s+as\s+attendees?|\s+to\s+(?:the\s+)?(?:calendar\s+)?(?:event|appointment|meeting|dinner|party|practice|attendees?))[.!?]?$/i,
  ) || input.match(
    /^(?:please\s+)?add\s+([a-z\s,and'-]+?)(?:\s+too)?[.!?]?$/i,
  )
  if (addAttendeeMatch && Array.isArray(options.familyNames) && !/\b(?:what\s+to\s+bring|notes?|checklist|recipe|ingredient)\b/i.test(input)) {
    const rawNames = addAttendeeMatch[1]
      .split(/\s*(?:,|&|\band\b|\+)\s*/i)
      .map(s => s.trim())
      .filter(Boolean)
    const validNames = rawNames
      .map((r) => options.familyNames.find((n) => n.toLowerCase() === r.toLowerCase()))
      .filter(Boolean)
    if (validNames.length > 0) {
      return {
        tool: 'update_event',
        args: {
          id: event.id,
          expected_updated_at: event.updated_at,
          members_add: validNames,
        },
        event,
      }
    }
  }

  // Incomplete attendee prompt
  if (/^(?:please\s+)?(?:add|remove)\s+(?:an\s+)?attendee[.!?]?$/i.test(input) || /^who\s+is\s+attending\??$/i.test(input)) {
    return {
      text: `Who would you like to update in the attendee list for "${event.title}"?`,
      event,
    }
  }

  // Clear what to bring
  if (/^(?:clear|remove|delete)\s+(?:what\s+to\s+bring|the\s+checklist|checklist)[.!?]?$/i.test(input)) {
    return {
      tool: 'update_event',
      args: {
        id: event.id,
        expected_updated_at: event.updated_at,
        what_to_bring: [],
      },
      event,
    }
  }

  // What to bring / pack / take
  const bringMatch = input.match(
    /^(?:please\s+)?(?:bring|pack|take|need\s+to\s+bring)\s+(.+?)[.!?]?$/i,
  ) || input.match(
    /^(?:please\s+)?add\s+(.+?)\s+to\s+(?:what\s+to\s+bring|checklist)[.!?]?$/i,
  )
  if (bringMatch && !/\b(?:attendees?|member|driver|venue|location)\b/i.test(input)) {
    const rawItems = bringMatch[1].trim()
    const items = rawItems.split(/\s*(?:,|and|\+)\s*/i).map(s => s.trim()).filter(Boolean)
    if (items.length > 0) {
      return {
        tool: 'update_event',
        args: {
          id: event.id,
          expected_updated_at: event.updated_at,
          what_to_bring: items,
        },
        event,
      }
    }
  }

  // Outfit suggestion
  const outfitMatch = input.match(
    /^(?:please\s+)?(?:wear|outfit(?:\s+is)?|dress\s+code(?:\s+is)?)\s+(.+?)[.!?]?$/i,
  )
  if (outfitMatch) {
    const rawOutfit = outfitMatch[1].trim()
    if (rawOutfit.length > 0) {
      return {
        tool: 'update_event',
        args: {
          id: event.id,
          expected_updated_at: event.updated_at,
          outfit_suggestion: rawOutfit,
        },
        event,
      }
    }
  }

  // Notes
  const notesMatch = input.match(
    /^(?:please\s+)?(?:add\s+note|set\s+note|add\s+a\s+note|note|notes)\s*(?::\s*|\s+that\s+|\s+to\s+|\s+)(.+?)[.!?]?$/i,
  )
  if (notesMatch) {
    const rawNotes = notesMatch[1].trim()
    if (rawNotes.length > 0) {
      return {
        tool: 'update_event',
        args: {
          id: event.id,
          expected_updated_at: event.updated_at,
          notes: rawNotes,
        },
        event,
      }
    }
  }

  // All day toggle
  if (/^(?:make\s+it\s+all\s+day|set\s+(?:to\s+)?all\s+day|all\s+day)[.!?]?$/i.test(input)) {
    return {
      tool: 'update_event',
      args: {
        id: event.id,
        expected_updated_at: event.updated_at,
        all_day: true,
      },
      event,
    }
  }
  if (/^(?:not\s+all\s+day|turn\s+off\s+all\s+day|timed\s+event)[.!?]?$/i.test(input)) {
    return {
      tool: 'update_event',
      args: {
        id: event.id,
        expected_updated_at: event.updated_at,
        all_day: false,
      },
      event,
    }
  }

  const relativeDays = input.match(/\b(?:back|earlier)\s+(one|two|three|four|five|six|seven|\d+)\s+days?\b/i)
  if (relativeDays && /\b(?:move|shift|push|reschedule)\b/i.test(input)) {
    const amount = NUMBER_WORDS.get(relativeDays[1].toLowerCase()) ?? Number(relativeDays[1])
    return Number.isFinite(amount) && amount > 0 ? shiftDays(event, -amount) : null
  }

  const relativeMinutes = input.match(/\b(?:bump|push|shift)\s+(?:it|that|this)?\s*back\s+(half an hour|(?:one|two|three|four|five|six|seven|\d+)\s+(?:hours?|minutes?))\b/i)
  if (relativeMinutes) {
    const amountText = relativeMinutes[1].toLowerCase()
    const amountMatch = amountText.match(/(one|two|three|four|five|six|seven|\d+)\s+(hours?|minutes?)/)
    const amount = amountText === 'half an hour'
      ? 30
      : amountMatch
        ? (NUMBER_WORDS.get(amountMatch[1]) ?? Number(amountMatch[1])) *
          (/^hour/.test(amountMatch[2]) ? 60 : 1)
        : null
    const duration = durationMs(event)
    if (!Number.isFinite(amount) || amount <= 0 || duration == null) return null
    const start = new Date(Date.parse(event.start_time) + amount * 60000)
    const candidate = {
      start: start.toISOString(),
      end: new Date(start.getTime() + duration).toISOString(),
    }
    const conflicts = overlaps(candidate, events, event.id)
    if (conflicts.length > 0) {
      return {
        text: `That time overlaps "${conflicts[0].title}". Would you like a different time?`,
        event,
      }
    }
    return {
      tool: 'update_event',
      args: {
        id: event.id,
        expected_updated_at: event.updated_at,
        ...candidate,
      },
      event,
    }
  }

  if (/\bimmediately after (?:the )?meeting\b/i.test(input)) {
    const candidates = events
      .filter((candidate) => candidate.id !== event.id && /\bmeeting\b/i.test(candidate.title))
      .filter((candidate) => localWeekday(candidate.start_time, options.utcOffset) === localWeekday(event.start_time, options.utcOffset))
      .sort((a, b) => Date.parse(a.end_time) - Date.parse(b.end_time))
    if (candidates.length !== 1) return { text: 'Which meeting should I place it after?', event }
    const duration = durationMs(event)
    if (duration == null) return null
    const start = new Date(candidates[0].end_time)
    return {
      tool: 'update_event',
      args: {
        id: event.id,
        expected_updated_at: event.updated_at,
        start: start.toISOString(),
        end: new Date(start.getTime() + duration).toISOString(),
      },
      event,
    }
  }

  const requestedTime = input.match(/\b(?:to|at)\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?::(\d{2}))?\s*(am|pm|morning|afternoon|evening|night)?\b/i)
  if (requestedTime && /\b(?:actually|instead|move|make|change|reschedule|shift)\b/i.test(input)) {
    let hour = NUMBER_WORDS.get(requestedTime[1].toLowerCase()) ?? Number(requestedTime[1])
    const minute = Number(requestedTime[2] ?? 0)
    const period = requestedTime[3]?.toLowerCase()
    const originalLocalHour = localHour(event.start_time, options.utcOffset)
    const inferredPm = !period && originalLocalHour >= 12
    if ((period === 'pm' || ['afternoon', 'evening', 'night'].includes(period) || inferredPm) && hour !== 12) hour += 12
    if ((period === 'am' || period === 'morning') && hour === 12) hour = 0
    const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const requestedWeekday = weekdayNames.findIndex((day) => new RegExp(`\\b${day}\\b`, 'i').test(input))
    const start = new Date(event.start_time)
    if (requestedWeekday >= 0) {
      const correctionReference = options.now instanceof Date && /\b(?:actually|instead)\b/i.test(input)
        ? options.now
        : start
      start.setTime(correctionReference.getTime())
      let daysAhead = requestedWeekday - localWeekday(correctionReference.toISOString(), options.utcOffset)
      if (daysAhead < 0 || (daysAhead === 0 && /\bnext\s+(?:sun|mon|tue|wed|thu|fri|sat)/i.test(input))) daysAhead += 7
      start.setUTCDate(start.getUTCDate() + daysAhead)
    }
    const offsetMatch = String(options.utcOffset ?? '').match(/^([+-])(\d{2}):(\d{2})$/)
    const offset = offsetMatch
      ? (offsetMatch[1] === '+' ? 1 : -1) * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]))
      : 0
    const local = new Date(start.getTime() + offset * 60000)
    const movedStart = new Date(Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
      hour,
      minute,
    ) - offset * 60000)
    const durationMatch = input.match(/\bfor\s+(\d+|one|two|three|four|five|six|seven|eight|nine)\s+(hours?|minutes?)\b/i)
    const durationAmount = durationMatch
      ? NUMBER_WORDS.get(durationMatch[1].toLowerCase()) ?? Number(durationMatch[1])
      : null
    const requestedDuration = durationMatch && Number.isFinite(durationAmount)
      ? durationAmount * (/^hour/i.test(durationMatch[2]) ? 60 * 60000 : 60000)
      : null
    const duration = requestedDuration ?? durationMs(event)
    if (duration == null) return null
    const candidate = { start: movedStart.toISOString(), end: new Date(movedStart.getTime() + duration).toISOString() }
    const conflicts = overlaps(candidate, events, event.id)
    if (conflicts.length > 0) {
      return {
        text: `That time overlaps "${conflicts[0].title}". Would you like a different time?`,
        event,
      }
    }
    return {
      tool: 'update_event',
      args: {
        id: event.id,
        expected_updated_at: event.updated_at,
        ...candidate,
      },
      event,
    }
  }

  return null
}

export function calendarMutationClarification(text) {
  const input = normalizeAssistantSpeechPunctuation(text)
  if (/\b(?:schedule|book|add|create)\b.*\b(?:at)\s+(?:ate|eight)\b/i.test(input) && !/\b(?:am|pm|morning|afternoon|evening|night)\b/i.test(input)) {
    return 'Did you mean 8 AM or 8 PM?'
  }
  return null
}

export function resolveClarifiedCalendarCreate(previousText, text, options = {}) {
  const previous = normalizeAssistantSpeechPunctuation(previousText)
  const current = normalizeAssistantSpeechPunctuation(text)
  const scheduling = previous.match(/\b(?:schedule|book|add|create)\s+(?:an?\s+)?(?:event\s+called\s+)?(.+?)\s+(?:next\s+)?(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\s+at\s+(?:ate|eight)\b/i)
  const clarifiedTime = current.match(/\b(eight|8)(?::(\d{2}))?\s+(?:in\s+the\s+)?(morning|evening|night|afternoon)\b/i)
  if (!scheduling || !clarifiedTime) return null
  const now = options.now instanceof Date ? options.now : new Date()
  const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(scheduling[2].toLowerCase().slice(0, 3))
  let daysAhead = weekday - now.getDay()
  if (daysAhead <= 0 || /\bnext\s+/i.test(previous)) daysAhead += 7
  const hour = clarifiedTime[3].toLowerCase() === 'morning' ? 8 : 20
  const start = new Date(now)
  start.setDate(start.getDate() + daysAhead)
  start.setHours(hour, Number(clarifiedTime[2] ?? 0), 0, 0)
  return {
    tool: 'create_event',
    args: {
      title: scheduling[1].trim(),
      start: start.toISOString(),
      end: new Date(start.getTime() + 60 * 60000).toISOString(),
      members: [],
      event_type: 'event',
    },
  }
}

export function resolvePendingCalendarCorrection(text, pendingAction, options = {}) {
  if (pendingAction?.tool !== 'create_event') return null
  const input = normalizeAssistantSpeechPunctuation(text)
  const clarifiedMemberName = input.match(/\b(?:mom|mother|dad|father|grandma|grandmother|grandpa|grandfather)\s+is\s+([a-z][a-z'-]*)\b/i)?.[1]
  const clarifiedMember = clarifiedMemberName && Array.isArray(options.familyNames)
    ? options.familyNames.find((name) => name.toLowerCase() === clarifiedMemberName.toLowerCase())
    : null
  if (clarifiedMember) {
    const oldStart = Date.parse(pendingAction.args?.start)
    const oldEnd = Date.parse(pendingAction.args?.end)
    const requestedDuration = /\b(?:an?\s+)?hour and a half\b/i.test(input)
      ? 90 * 60000
      : null
    const duration = requestedDuration ??
      (Number.isFinite(oldStart) && Number.isFinite(oldEnd) && oldEnd > oldStart
        ? oldEnd - oldStart
        : 60 * 60000)
    return {
      tool: 'create_event',
      args: {
        ...pendingAction.args,
        members: [...new Set([...(pendingAction.args?.members ?? []), clarifiedMember])],
        ...(Number.isFinite(oldStart)
          ? { end: new Date(oldStart + duration).toISOString() }
          : {}),
      },
    }
  }
  if (!/(?:\b(?:actually|instead|rather|make that|change that|move that)\b|^(?:no|wait)\b)/i.test(input)) return null
  const weekdayMatch = input.match(/\b(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\b/i)
  const timeMatch = input.match(/\b(\d{1,2})(?::(\d{2}))?\s*(?:(am|pm)|(?:in\s+the\s+)?(morning|afternoon|evening|night))\b/i)
  if (!weekdayMatch || !timeMatch) return null
  let hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2] ?? 0)
  const period = String(timeMatch[3] ?? timeMatch[4]).toLowerCase()
  const isPm = period === 'pm' || ['afternoon', 'evening', 'night'].includes(period)
  if (isPm && hour !== 12) hour += 12
  if (!isPm && hour === 12) hour = 0
  if (hour > 23 || minute > 59) return null

  const now = options.now instanceof Date ? options.now : new Date()
  const offsetMatch = String(options.utcOffset ?? '').match(/^([+-])(\d{2}):(\d{2})$/)
  const offset = offsetMatch
    ? (offsetMatch[1] === '+' ? 1 : -1) * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]))
    : 0
  const localNow = new Date(now.getTime() + offset * 60000)
  const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(weekdayMatch[1].toLowerCase().slice(0, 3))
  let daysAhead = weekday - localNow.getUTCDay()
  if (daysAhead < 0) daysAhead += 7
  const start = new Date(Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate() + daysAhead,
    hour,
    minute,
  ) - offset * 60000)
  if (start.getTime() <= now.getTime()) start.setUTCDate(start.getUTCDate() + 7)

  const oldStart = Date.parse(pendingAction.args?.start)
  const oldEnd = Date.parse(pendingAction.args?.end)
  const duration = Number.isFinite(oldStart) && Number.isFinite(oldEnd) && oldEnd > oldStart
    ? oldEnd - oldStart
    : 60 * 60000
  return {
    tool: 'create_event',
    args: {
      ...pendingAction.args,
      start: start.toISOString(),
      end: new Date(start.getTime() + duration).toISOString(),
    },
  }
}

export function singularBulkDeleteClarification(text, tool, args, events, formatTime = (value) => value) {
  if (
    tool !== 'delete_events_by_title'
    || /\b(?:all|every|both|each)\b/i.test(String(text ?? ''))
    || /\bclear\s+(?:my\s+)?calendar\b/i.test(String(text ?? ''))
  ) return null
  const ids = Array.isArray(args?.ids) ? new Set(args.ids) : new Set()
  const matches = events.filter((event) => ids.has(event.id))
  if (matches.length < 2) return null
  const choices = matches.slice(0, 5).map((event) => `${event.title} at ${formatTime(event.start_time)}`)
  return `I found ${matches.length} matching events. Which one should I delete: ${choices.join('; ')}?`
}

export function resolveCalendarDeleteDisambiguation(previousText, text, events, options = {}) {
  const current = normalizeAssistantSpeechPunctuation(text)
  const request = parseDeleteSelectionRequest(previousText)
  const dayPart = /\bafternoon\b/i.test(current) ? 'afternoon' : /\bmorning\b/i.test(current) ? 'morning' : null
  if (!request || !dayPart) return null
  const matches = deleteSelectionMatches(request, events, options.utcOffset).filter((event) => {
    const hour = localHour(event.start_time, options.utcOffset)
    return dayPart === 'afternoon' ? hour >= 12 : hour < 12
  })
  if (matches.length !== 1) return null
  return {
    tool: 'delete_event',
    args: { id: matches[0].id, title: matches[0].title },
    event: matches[0],
  }
}

export function isCalendarMutationDisambiguationFollowUp(previousText, text) {
  const previous = normalizeAssistantSpeechPunctuation(previousText)
  const current = normalizeAssistantSpeechPunctuation(text)
  return /^(?:delete|cancel|remove|move|reschedule|shift|change)\b/i.test(previous)
    && /^(?:the\s+)?(?:(?:morning|afternoon|evening|earlier|later)\s+one|one\s+at\s+\d|first|second|last)(?:\s+one)?[.!]?$/i.test(current)
}

export function calendarDeleteAmbiguityClarification(text, events, options = {}, formatTime = (value) => value) {
  const input = normalizeAssistantSpeechPunctuation(text)
  if (/\b(?:all|every|both|each)\b/i.test(input)) return null
  const request = parseDeleteSelectionRequest(input)
  if (!request) return null
  const matches = deleteSelectionMatches(request, events, options.utcOffset)
  if (matches.length < 2) return null
  const choices = matches.map((event) => `${event.title} at ${formatTime(event.start_time)}`)
  return `I found ${matches.length} matching events. Which one should I delete: ${choices.join('; ')}?`
}

export function answerPendingSelectiveClear(text, pendingAction) {
  const input = normalizeAssistantSpeechPunctuation(text)
  if (
    pendingAction?.tool !== 'delete_events_by_title'
    || !/\b(?:what|which)\b.*\bremain|what exactly would remain/i.test(input)
  ) return null
  const titleQuery = String(pendingAction?.args?.title_query ?? '')
  const preserved = titleQuery.match(/\bexcept\s+(.+)$/i)?.[1]?.trim()
  return preserved ? `${preserved} would remain on the calendar.` : null
}
