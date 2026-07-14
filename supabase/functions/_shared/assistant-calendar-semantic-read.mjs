const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function offsetMinutes(value) {
  const match = String(value ?? '').match(/^([+-])(\d{2}):(\d{2})$/)
  if (!match) return 0
  return (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3]))
}

function formatOffset(offset) {
  const sign = offset >= 0 ? '+' : '-'
  const absolute = Math.abs(offset)
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
}

function localDayStartMs(date, offset) {
  const shifted = new Date(date.getTime() + offset * 60000)
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - offset * 60000
}

function localDateStartMs(year, month, day, offset) {
  return Date.UTC(year, month, day) - offset * 60000
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

function nextDateStartMs(parts, localNow, today, offset, notBefore = null) {
  const month = parts.month - 1
  let year = parts.year ?? localNow.getUTCFullYear()
  let start = localDateStartMs(year, month, parts.day, offset)
  while (!parts.year && (start + 86400000 <= today || (notBefore !== null && start < notBefore))) {
    year += 1
    start = localDateStartMs(year, month, parts.day, offset)
  }
  return { start, year, month }
}

function localTime(iso, offset) {
  return new Date(Date.parse(iso) + offset * 60000).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  })
}

function rangeForScope(scope, now, offset) {
  const today = localDayStartMs(now, offset)
  const localNow = new Date(now.getTime() + offset * 60000)
  const kind = scope?.kind ?? 'today'
  let range
  if (kind === 'relative_day') {
    const start = today + scope.daysAhead * 86400000
    range = { start, end: start + 86400000, label: scope.daysAhead === 2 ? 'the day after tomorrow' : `in ${scope.daysAhead} days` }
  }
  if (kind === 'tomorrow') range = { start: today + 86400000, end: today + 2 * 86400000, label: 'tomorrow' }
  if (kind === 'tonight') return { start: Math.max(now.getTime(), today + 17 * 3600000), end: today + 86400000, label: 'tonight' }
  if (kind === 'next_days') {
    return { start: now.getTime(), end: today + scope.count * 86400000, label: `in the next ${scope.count} ${scope.count === 1 ? 'day' : 'days'}` }
  }
  if (kind === 'week') {
    const end = today + (7 - localNow.getUTCDay()) * 86400000
    return { start: now.getTime(), end, label: 'the rest of this week' }
  }
  if (kind === 'next_week') {
    const nextSunday = today + (7 - localNow.getUTCDay()) * 86400000
    return { start: nextSunday, end: nextSunday + 7 * 86400000, label: 'next week' }
  }
  if (kind === 'weekend') {
    const daysUntilSaturday = (6 - localNow.getUTCDay() + 7) % 7
    const saturday = today + daysUntilSaturday * 86400000
    return { start: saturday, end: saturday + 2 * 86400000, label: 'this weekend' }
  }
  if (kind === 'month' || kind === 'next_month') {
    const monthOffset = kind === 'next_month' ? 1 : 0
    const year = localNow.getUTCFullYear() + Math.floor((localNow.getUTCMonth() + monthOffset) / 12)
    const month = (localNow.getUTCMonth() + monthOffset) % 12
    const start = localDateStartMs(year, month, 1, offset)
    const end = localDateStartMs(year, month + 1, 1, offset)
    return { start: kind === 'month' ? Math.max(now.getTime(), start) : start, end, label: kind === 'month' ? 'the rest of this month' : 'next month' }
  }
  if (kind === 'named_month') {
    let year = localNow.getUTCFullYear()
    const month = scope.month - 1
    let start = localDateStartMs(year, month, 1, offset)
    if (localDateStartMs(year, month + 1, 1, offset) <= now.getTime()) {
      year += 1
      start = localDateStartMs(year, month, 1, offset)
    }
    const end = localDateStartMs(year, month + 1, 1, offset)
    const label = new Date(Date.UTC(year, month, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    return { start: Math.max(now.getTime(), start), end, label }
  }
  if (kind === 'date') {
    const month = scope.month - 1
    let year = scope.year ?? localNow.getUTCFullYear()
    if (scope.month < 1 || scope.month > 12 || scope.day < 1 || scope.day > daysInMonth(year, month)) {
      return { start: today, end: today + 86400000, label: 'today' }
    }
    let start = localDateStartMs(year, month, scope.day, offset)
    if (!scope.year && start + 86400000 <= today) {
      year += 1
      start = localDateStartMs(year, month, scope.day, offset)
    }
    const label = new Date(Date.UTC(year, month, scope.day)).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      ...(scope.year ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    })
    range = { start, end: start + 86400000, label }
  }
  if (kind === 'date_range') {
    const resolvedStart = nextDateStartMs(scope.start, localNow, today, offset)
    const resolvedEnd = nextDateStartMs(scope.end, localNow, today, offset, resolvedStart.start)
    const startLabel = new Date(Date.UTC(resolvedStart.year, resolvedStart.month, scope.start.day))
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    const endLabel = new Date(Date.UTC(resolvedEnd.year, resolvedEnd.month, scope.end.day))
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    return { start: resolvedStart.start, end: resolvedEnd.start + 86400000, label: `${startLabel} through ${endLabel}` }
  }
  if (kind === 'weekday_range') {
    const startIndex = WEEKDAYS.indexOf(scope.startWeekday)
    const endIndex = WEEKDAYS.indexOf(scope.endWeekday)
    let startAhead = startIndex - localNow.getUTCDay()
    if (startAhead < 0 || (scope.modifier === 'next' && startAhead === 0)) startAhead += 7
    let endAhead = endIndex - startIndex
    if (endAhead < 0) endAhead += 7
    const start = today + startAhead * 86400000
    const end = start + (endAhead + 1) * 86400000
    return {
      start,
      end,
      label: `${scope.startWeekday[0].toUpperCase()}${scope.startWeekday.slice(1)} through ${scope.endWeekday[0].toUpperCase()}${scope.endWeekday.slice(1)}`,
    }
  }
  if (kind === 'weekday') {
    const target = WEEKDAYS.indexOf(scope.weekday)
    let daysAhead = target - localNow.getUTCDay()
    if (daysAhead < 0) daysAhead += 7
    if (scope.modifier === 'next' && daysAhead === 0) daysAhead = 7
    const start = today + daysAhead * 86400000
    const label = `${scope.weekday[0].toUpperCase()}${scope.weekday.slice(1)}`
    range = { start, end: start + 86400000, label }
  }
  range ??= { start: today, end: today + 86400000, label: 'today' }

  if (scope?.time) {
    const start = range.start + scope.time.hour * 3600000 + scope.time.minute * 60000
    return { start, end: start + 60000, label: `${range.label} at ${localTime(new Date(start).toISOString(), offset)}` }
  }
  if (scope?.timeRange && range.end - range.start <= 86400000) {
    const start = range.start + scope.timeRange.start.hour * 3600000 + scope.timeRange.start.minute * 60000
    let end = range.start + scope.timeRange.end.hour * 3600000 + scope.timeRange.end.minute * 60000
    if (end <= start) end += 86400000
    return { start, end, label: `${range.label} from ${localTime(new Date(start).toISOString(), offset)} to ${localTime(new Date(end).toISOString(), offset)}` }
  }
  const dayParts = {
    morning: [5, 12],
    afternoon: [12, 20],
    evening: [17, 21],
    night: [17, 24],
  }
  const hours = dayParts[scope?.dayPart]
  if (hours && range.end - range.start <= 86400000) {
    return {
      start: range.start + hours[0] * 3600000,
      end: range.start + hours[1] * 3600000,
      label: `${range.label} ${scope.dayPart}`,
    }
  }
  return range
}

function eventsInRange(events, range, now, offset, includePast = false) {
  return (events ?? [])
    .filter((event) => {
      const start = Date.parse(event?.start_time)
      const parsedEnd = Date.parse(event?.end_time)
      const end = Number.isFinite(parsedEnd) ? parsedEnd : start + 1
      return eventOverlapsCalendarRange(event, range, formatOffset(offset)) &&
        (includePast || event.all_day || !Number.isFinite(end) || end > now.getTime())
    })
    .sort((a, b) => compareCalendarEvents(a, b, formatOffset(offset)))
}

function eventLine(event, offset) {
  const when = event.all_day ? 'All day' : localTime(event.start_time, offset)
  return `${when} — ${event.title}${event.location_name ? ` at ${event.location_name}` : ''}`
}

export function calendarRangeForScope(scope, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now())
  const offset = offsetMinutes(options.utcOffset)
  const range = rangeForScope(scope, now, offset)
  const usesPartialDay = Boolean(scope?.dayPart || scope?.time || scope?.timeRange)
  const contextStart = usesPartialDay ? localDayStartMs(new Date(range.start), offset) : range.start
  const contextEnd = usesPartialDay ? contextStart + 86400000 : range.end
  return {
    start: new Date(range.start).toISOString(),
    end: new Date(range.end).toISOString(),
    contextStart: new Date(contextStart).toISOString(),
    contextEnd: new Date(contextEnd).toISOString(),
    label: range.label,
  }
}

export function resolveCalendarSemanticRead(frame, events, options = {}) {
  if (!frame || !['calendar.list', 'calendar.next', 'calendar.count', 'calendar.availability', 'calendar.destinations'].includes(frame.intent)) return null
  const now = options.now instanceof Date ? options.now : new Date()
  const offset = offsetMinutes(options.utcOffset)
  const scope = frame.slots?.temporalScope

  if (frame.intent === 'calendar.next') {
    const nowMs = now.getTime()
    const inProgress = (events ?? []).filter((event) => {
      const start = Date.parse(event?.start_time)
      const end = Date.parse(event?.end_time)
      return !event?.all_day && start <= nowMs && end > nowMs
    }).sort((a, b) => Date.parse(a.end_time) - Date.parse(b.end_time))[0]
    const upcoming = (events ?? []).filter((event) =>
      !event?.all_day && Date.parse(event?.start_time) > nowMs
    )
      .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time))[0]
    const selected = inProgress ?? upcoming
    if (!selected) return { text: 'Nothing else is coming up on your calendar.', events: [], intent: frame.intent }
    const prefix = inProgress ? 'Happening now' : 'Up next'
    return { text: `${prefix}: ${eventLine(selected, offset)}.`, events: [selected], intent: frame.intent }
  }

  const range = rangeForScope(scope, now, offset)
  const rows = eventsInRange(events, range, now, offset)
  if (frame.intent === 'calendar.count') {
    const text = rows.length === 0
      ? `You have no calendar events ${range.label}.`
      : `You have ${rows.length} calendar ${rows.length === 1 ? 'event' : 'events'} ${range.label}.`
    return { text, events: rows, intent: frame.intent, scope: range.label }
  }
  if (frame.intent === 'calendar.availability') {
    const overlaps = []
    const timedRows = rows.filter((event) => !event.all_day && event.event_type !== 'reminder')
    for (let i = 0; i < timedRows.length; i += 1) {
      for (let j = i + 1; j < timedRows.length; j += 1) {
        if (Date.parse(timedRows[j].start_time) < Date.parse(timedRows[i].end_time)) {
          overlaps.push([timedRows[i], timedRows[j]])
        }
      }
    }
    const text = overlaps.length
      ? `There ${overlaps.length === 1 ? 'is' : 'are'} ${overlaps.length} calendar ${overlaps.length === 1 ? 'conflict' : 'conflicts'} ${range.label}.`
      : rows.length
        ? `You have ${rows.length} ${rows.length === 1 ? 'event' : 'events'} ${range.label}, with no overlaps.`
        : `Your calendar is free ${range.label}.`
    return { text, events: rows, conflicts: overlaps, intent: frame.intent, scope: range.label }
  }
  if (frame.intent === 'calendar.destinations') {
    const destinationRows = rows.filter((event) => String(event.address || event.location_name || '').trim())
    if (destinationRows.length === 0) return { text: `You do not have any calendar destinations ${range.label}.`, events: [], intent: frame.intent, scope: range.label }
    const lines = destinationRows.map((event) => {
      const destination = String(event.address || event.location_name).trim()
      return `${localTime(event.start_time, offset)} — ${event.title}: ${destination}`
    })
    return {
      text: `${destinationRows.length === 1 ? 'One destination' : `${destinationRows.length} destinations`} ${range.label}:\n${lines.map((line) => `- ${line}`).join('\n')}`,
      events: destinationRows,
      intent: frame.intent,
      scope: range.label,
    }
  }

  const usesPartialDay = Boolean(scope?.dayPart || scope?.time || scope?.timeRange)
  const requestedIds = new Set(rows.map((event) => event.id))
  const laterRows = usesPartialDay
    ? eventsInRange(
        events,
        {
          start: range.end,
          end: localDayStartMs(new Date(range.start), offset) + 86400000,
          label: range.label,
        },
        now,
        offset,
      ).filter((event) => !event.all_day && !requestedIds.has(event.id))
    : []
  if (rows.length === 0 && laterRows.length === 0) {
    return { text: `Nothing is on your calendar ${range.label}.`, events: [], intent: frame.intent, scope: range.label }
  }
  const laterText = laterRows.length > 0
    ? `\nLater that day:\n${laterRows.map((event) => `- ${eventLine(event, offset)}`).join('\n')}`
    : ''
  if (rows.length === 0) {
    return {
      text: `Nothing is on your calendar ${range.label}.${laterText}`,
      events: laterRows,
      intent: frame.intent,
      scope: range.label,
    }
  }
  const header = rows.length === 1
    ? `One thing is on your calendar ${range.label}:`
    : `${rows.length} things are on your calendar ${range.label}:`
  return {
    text: `${header}\n${rows.map((event) => `- ${eventLine(event, offset)}`).join('\n')}${laterText}`,
    events: [...rows, ...laterRows],
    intent: frame.intent,
    scope: range.label,
  }
}
import {
  compareCalendarEvents,
  eventOverlapsCalendarRange,
} from './assistant-event-range.mjs'
