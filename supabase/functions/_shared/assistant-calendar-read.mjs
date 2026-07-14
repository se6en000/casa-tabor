const READ_DAY = /\b(today|tomorrow|tonight)\b/i
const READ_TERMS = /\b(calendar|schedule|agenda|event|events|appointment|appointments|what do (?:i|we) have|what(?:'s| is) on|anything)\b/i
const MUTATION_TERMS = /\b(add|create|book|move|reschedule|delete|remove|cancel|change|update|edit)\b/i

function offsetMinutes(value) {
  const match = String(value ?? '').match(/^([+-])(\d{2}):(\d{2})$/)
  if (!match) return 0
  return (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3]))
}

function localDayStartMs(date, offset) {
  const shifted = new Date(date.getTime() + offset * 60000)
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - offset * 60000
}

function localTime(iso, offset) {
  const shifted = new Date(Date.parse(iso) + offset * 60000)
  return shifted.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  })
}

export function resolveCalendarDayRead(text, events, options = {}) {
  const input = String(text ?? '').replace(/\s+/g, ' ').trim()
  const dayMatch = input.match(READ_DAY)
  if (!dayMatch || !READ_TERMS.test(input) || MUTATION_TERMS.test(input)) return null

  const now = options.now instanceof Date ? options.now : new Date()
  const offset = offsetMinutes(options.utcOffset)
  const todayStart = localDayStartMs(now, offset)
  const day = dayMatch[1].toLowerCase()
  const start = day === 'tomorrow' ? todayStart + 86400000 : todayStart
  const end = start + 86400000
  const rows = (events ?? [])
    .filter((event) => {
      return eventOverlapsCalendarRange(event, { start, end }, options.utcOffset)
    })
    .sort((a, b) => compareCalendarEvents(a, b, options.utcOffset))

  const label = day === 'tomorrow' ? 'tomorrow' : day === 'tonight' ? 'tonight' : 'today'
  if (rows.length === 0) return { text: `Nothing is on your calendar ${label}.`, events: [], day: label }

  const lines = rows.map((event) => {
    const when = event.all_day ? 'All day' : localTime(event.start_time, offset)
    const location = event.location_name ? ` at ${event.location_name}` : ''
    return `${when} — ${event.title}${location}`
  })
  const header = rows.length === 1
    ? `One thing is on your calendar ${label}:`
    : `${rows.length} things are on your calendar ${label}:`
  return { text: `${header}\n${lines.join('\n')}`, events: rows, day: label }
}
import {
  compareCalendarEvents,
  eventOverlapsCalendarRange,
} from './assistant-event-range.mjs'
