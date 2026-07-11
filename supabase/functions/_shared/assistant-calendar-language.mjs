const CALENDAR_NOUNS = /\b(calendar|schedule|agenda|events?|appointments?|meetings?|plans?)\b/i
const TEMPORAL_WORDS = /\b(today|tomorrow|tonight|week|weekend|sunday|monday|tuesday|wednesday|thursday|friday|saturday|next|later|after)\b/i
const ACTIVE_REFERENCE = /\b(it|that|this|there|the event|the appointment|the party)\b/i

const LIST_OPENERS = [
  "what's on", 'what is on', 'what do i have', 'what do we have',
  'show me', 'tell me', 'give me', 'run through', 'rundown',
]
const CALENDAR_OBJECTS = ['my calendar', 'the calendar', 'my schedule', 'the schedule', 'my agenda', 'the agenda']
const DAY_SCOPES = ['today', 'tomorrow', 'tonight', 'this week', 'this weekend', 'next week']

export const CALENDAR_INTENTS = Object.freeze([
  'calendar.list',
  'calendar.next',
  'calendar.count',
  'calendar.availability',
  'event.select',
  'event.location',
  'event.address',
  'event.time',
  'event.duration',
  'event.attendees',
  'event.preparation',
  'event.travel',
  'event.create',
  'event.move',
  'event.delete',
])

export const CALENDAR_UTTERANCE_CORPUS = Object.freeze([
  ...LIST_OPENERS.flatMap((opener) => DAY_SCOPES.map((scope) => ({
    text: `${opener} ${CALENDAR_OBJECTS[0]} ${scope}`,
    intent: 'calendar.list',
  }))),
  ...CALENDAR_OBJECTS.flatMap((object) => DAY_SCOPES.map((scope) => ({
    text: `show me ${object} ${scope}`,
    intent: 'calendar.list',
  }))),
  ...DAY_SCOPES.map((scope) => ({ text: `how many appointments do we have ${scope}`, intent: 'calendar.count' })),
  ...DAY_SCOPES.map((scope) => ({ text: `are we free ${scope}`, intent: 'calendar.availability' })),
  ...['what is next', "what's next", 'what do I have next', 'what is coming up', 'anything after this'].map((text) => ({
    text,
    intent: 'calendar.next',
  })),
  ...['where is it', "what's the location", 'which venue is that', 'where do we need to go'].map((text) => ({
    text,
    intent: 'event.location',
    requiresActiveEvent: true,
  })),
  ...["what's the address", 'show me the address', 'what address do I use'].map((text) => ({
    text,
    intent: 'event.address',
    requiresActiveEvent: true,
  })),
  ...['when is it', 'what time does it start', 'when does it end'].map((text) => ({
    text,
    intent: 'event.time',
    requiresActiveEvent: true,
  })),
  ...['how long is the event', 'how long does it last', 'how long is the party'].map((text) => ({
    text,
    intent: 'event.duration',
    requiresActiveEvent: true,
  })),
  ...['who is going', "who's coming", 'who is attached to it'].map((text) => ({
    text,
    intent: 'event.attendees',
    requiresActiveEvent: true,
  })),
  ...['what should we bring', 'prep me for it', 'what do we need to prepare'].map((text) => ({
    text,
    intent: 'event.preparation',
    requiresActiveEvent: true,
  })),
  ...['how long is the drive', 'how long to get there', 'when should we leave', 'what is the travel time'].map((text) => ({
    text,
    intent: 'event.travel',
    requiresActiveEvent: true,
  })),
])

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[?!.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function temporalScope(input) {
  if (/\bnext week\b/.test(input)) return { kind: 'next_week' }
  if (/\b(?:this )?weekend\b/.test(input)) return { kind: 'weekend' }
  if (/\bthis week\b|\bfor the week\b/.test(input)) return { kind: 'week' }
  if (/\btonight\b/.test(input)) return { kind: 'tonight' }
  if (/\btomorrow\b/.test(input)) return { kind: 'tomorrow' }
  if (/\btoday\b/.test(input)) return { kind: 'today' }
  const weekday = input.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)?.[1]
  if (weekday) return { kind: 'weekday', weekday }
  return null
}

function frame(intent, confidence, slots = {}, requiresActiveEvent = false) {
  return {
    domain: 'calendar',
    intent,
    confidence,
    source: 'calendar_language_contract',
    requiresActiveEvent,
    slots,
  }
}

export function parseCalendarLanguage(text, options = {}) {
  const input = normalize(text)
  if (!input) return null
  const activeEvent = options.activeEntityType === 'event' || options.focusedEvent === true
  const scope = temporalScope(input)
  const mutationLanguage = /\b(add|create|book|move|reschedule|shift|push|change|update|edit|delete|remove|cancel)\b/.test(input) ||
    /\bschedule\s+(?:an?\s+)?(?:event|appointment|meeting|reminder)\b/.test(input)

  if (mutationLanguage) {
    if (/\b(delete|remove|cancel)\b/.test(input)) return frame('event.delete', 0.98, { temporalScope: scope })
    if (/\b(move|reschedule|shift|push)\b/.test(input)) return frame('event.move', 0.98, { temporalScope: scope })
    if (/\b(add|create|book|schedule)\b/.test(input)) return frame('event.create', 0.96, { temporalScope: scope })
    if (activeEvent && /\b(change|update|edit)\b/.test(input)) {
      return frame('event.edit', 0.94, { temporalScope: scope }, true)
    }
  }

  if (activeEvent) {
    if (/\b(?:drive|travel|traffic|route|eta|get there|leave)\b/.test(input) || /\bhow long\b.*\b(?:get|drive|travel)\b/.test(input)) {
      return frame('event.travel', 0.99, {}, true)
    }
    if (/^\s*how long (?:will|does|would) it(?: take)?\s*$/.test(input)) {
      return frame('event.travel', 0.72, { ambiguousDuration: true }, true)
    }
    if (/\baddress\b/.test(input)) return frame('event.address', 0.99, {}, true)
    if (/\b(where|location|venue)\b/.test(input) || (ACTIVE_REFERENCE.test(input) && /\bgo\b/.test(input))) {
      return frame('event.location', 0.98, {}, true)
    }
    if (/\bhow long\b|\b(?:last|duration)\b/.test(input)) return frame('event.duration', 0.96, {}, true)
    if (/\b(?:what time|when|start|end)\b/.test(input)) return frame('event.time', 0.97, {}, true)
    if (/\b(?:who|attend|coming|going|members?)\b/.test(input)) return frame('event.attendees', 0.96, {}, true)
    if (/\b(?:bring|prepare|prep|details?|tell me about|need for)\b/.test(input)) {
      return frame('event.preparation', 0.95, {}, true)
    }
  }

  if (!/\bnext week\b/.test(input) && /\b(?:what(?:'s| is)|what do (?:i|we) have|anything)\b.*\b(?:next|coming up|after this)\b|^\s*next\s+(?:event|appointment)?\s*$/.test(input)) {
    return frame('calendar.next', 0.97, { temporalScope: scope })
  }
  if (/\bhow many\b.*(?:events?|appointments?|meetings?|things?|plans?)\b/.test(input)) {
    return frame('calendar.count', 0.98, { temporalScope: scope })
  }
  if (/\b(?:am i|are we|is everyone)\s+(?:free|busy)\b|\bany (?:conflicts?|overlaps?)\b/.test(input)) {
    return frame('calendar.availability', 0.97, { temporalScope: scope })
  }
  const listLanguage = /\b(?:what(?:'s| is) on|what do (?:i|we) have|show me|tell me|give me|run through|rundown|anything on|anything happening)\b/.test(input)
  if ((CALENDAR_NOUNS.test(input) || scope) && listLanguage && !mutationLanguage) {
    return frame('calendar.list', 0.96, { temporalScope: scope ?? { kind: 'today' } })
  }
  if (/\b(?:prepare|prep|find|look up|talk about|details? (?:for|on|about))\b/.test(input) && CALENDAR_NOUNS.test(input)) {
    return frame('event.select', 0.9, { temporalScope: scope })
  }
  return null
}

export function isCalendarLikeLanguage(text) {
  const input = normalize(text)
  return CALENDAR_NOUNS.test(input) || (TEMPORAL_WORDS.test(input) && /\b(?:have|doing|going on|free|busy|next)\b/.test(input))
}
