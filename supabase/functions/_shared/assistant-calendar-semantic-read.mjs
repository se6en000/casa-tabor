const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

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
  if (kind === 'tomorrow') return { start: today + 86400000, end: today + 2 * 86400000, label: 'tomorrow' }
  if (kind === 'tonight') return { start: Math.max(now.getTime(), today + 17 * 3600000), end: today + 86400000, label: 'tonight' }
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
  if (kind === 'weekday') {
    const target = WEEKDAYS.indexOf(scope.weekday)
    let daysAhead = target - localNow.getUTCDay()
    if (daysAhead < 0) daysAhead += 7
    const start = today + daysAhead * 86400000
    const label = `${scope.weekday[0].toUpperCase()}${scope.weekday.slice(1)}`
    return { start, end: start + 86400000, label }
  }
  return { start: today, end: today + 86400000, label: 'today' }
}

function eventsInRange(events, range, now, includePast = false) {
  return (events ?? [])
    .filter((event) => {
      const start = Date.parse(event?.start_time)
      const end = Date.parse(event?.end_time ?? event?.start_time)
      return Number.isFinite(start) && start >= range.start && start < range.end &&
        (includePast || event.all_day || !Number.isFinite(end) || end > now.getTime())
    })
    .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time))
}

function eventLine(event, offset) {
  const when = event.all_day ? 'All day' : localTime(event.start_time, offset)
  return `${when} — ${event.title}${event.location_name ? ` at ${event.location_name}` : ''}`
}

export function resolveCalendarSemanticRead(frame, events, options = {}) {
  if (!frame || !['calendar.list', 'calendar.next', 'calendar.count', 'calendar.availability'].includes(frame.intent)) return null
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
    const upcoming = (events ?? []).filter((event) => Date.parse(event?.start_time) > nowMs)
      .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time))[0]
    const selected = inProgress ?? upcoming
    if (!selected) return { text: 'Nothing else is coming up on your calendar.', events: [], intent: frame.intent }
    const prefix = inProgress ? 'Happening now' : 'Up next'
    return { text: `${prefix}: ${eventLine(selected, offset)}.`, events: [selected], intent: frame.intent }
  }

  const range = rangeForScope(scope, now, offset)
  const rows = eventsInRange(events, range, now)
  if (frame.intent === 'calendar.count') {
    const text = rows.length === 0
      ? `You have no calendar events ${range.label}.`
      : `You have ${rows.length} calendar ${rows.length === 1 ? 'event' : 'events'} ${range.label}.`
    return { text, events: rows, intent: frame.intent, scope: range.label }
  }
  if (frame.intent === 'calendar.availability') {
    const overlaps = []
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        if (Date.parse(rows[j].start_time) < Date.parse(rows[i].end_time)) overlaps.push([rows[i], rows[j]])
      }
    }
    const text = overlaps.length
      ? `There ${overlaps.length === 1 ? 'is' : 'are'} ${overlaps.length} calendar ${overlaps.length === 1 ? 'conflict' : 'conflicts'} ${range.label}.`
      : rows.length
        ? `You have ${rows.length} ${rows.length === 1 ? 'event' : 'events'} ${range.label}, with no overlaps.`
        : `Your calendar is free ${range.label}.`
    return { text, events: rows, conflicts: overlaps, intent: frame.intent, scope: range.label }
  }

  if (rows.length === 0) return { text: `Nothing is on your calendar ${range.label}.`, events: [], intent: frame.intent, scope: range.label }
  const header = rows.length === 1
    ? `One thing is on your calendar ${range.label}:`
    : `${rows.length} things are on your calendar ${range.label}:`
  return {
    text: `${header}\n${rows.map((event) => eventLine(event, offset)).join('\n')}`,
    events: rows,
    intent: frame.intent,
    scope: range.label,
  }
}
