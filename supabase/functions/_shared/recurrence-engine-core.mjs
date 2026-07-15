const RECURRENCE_LINE = /^(RRULE|RDATE|EXDATE)(?:;[^:]*)?:.+$/i

function assertValidTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date())
  } catch {
    throw new Error(`Invalid recurrence timezone: ${timezone}`)
  }
}

function normalizeRecurrenceLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('At least one recurrence line is required.')
  }

  const normalized = lines.map((line) => {
    if (typeof line !== 'string' || !RECURRENCE_LINE.test(line.trim())) {
      throw new Error(`Unsupported recurrence line: ${String(line)}`)
    }
    const trimmed = line.trim()
    const separator = trimmed.indexOf(':')
    return `${trimmed.slice(0, separator).toUpperCase()}:${trimmed.slice(separator + 1)}`
  })

  if (!normalized.some((line) => line.startsWith('RRULE:'))) {
    throw new Error('A recurring series requires an RRULE.')
  }
  return [...new Set(normalized)]
}

function utcWallString(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return [
    date.getUTCFullYear(),
    '-',
    pad(date.getUTCMonth() + 1),
    '-',
    pad(date.getUTCDate()),
    ' ',
    pad(date.getUTCHours()),
    ':',
    pad(date.getUTCMinutes()),
    ':',
    pad(date.getUTCSeconds()),
  ].join('')
}

function compactLocalDateTime(value) {
  return value.replace(' ', 'T').replace(/[-:]/g, '')
}

function occurrenceKey({ start, timezone, allDay, formatInTimeZone }) {
  if (allDay) return start.toISOString().slice(0, 10)
  return `${formatInTimeZone(start, timezone, "yyyy-MM-dd'T'HH:mm:ss")}[${timezone}]`
}

export function createRecurrenceEngine({ rrulestr, formatInTimeZone, fromZonedTime }) {
  if (typeof rrulestr !== 'function' || typeof formatInTimeZone !== 'function' || typeof fromZonedTime !== 'function') {
    throw new Error('Recurrence engine adapters are required.')
  }

  return {
    normalizeRecurrenceLines,
    generateOccurrences({
      dtstart,
      durationMs,
      recurrenceLines,
      timezone,
      rangeStart,
      rangeEnd,
      allDay = false,
      limit = 5000,
    }) {
      assertValidTimezone(timezone)
      const normalizedLines = normalizeRecurrenceLines(recurrenceLines)
      const startInstant = new Date(dtstart)
      const rangeStartInstant = new Date(rangeStart)
      const rangeEndInstant = new Date(rangeEnd)
      if (!Number.isFinite(startInstant.getTime())) throw new Error('Invalid recurrence start.')
      if (!Number.isFinite(rangeStartInstant.getTime()) || !Number.isFinite(rangeEndInstant.getTime())) {
        throw new Error('Invalid recurrence materialization range.')
      }
      if (rangeEndInstant <= rangeStartInstant) throw new Error('Recurrence range end must follow its start.')
      if (!Number.isFinite(durationMs) || durationMs < 0) throw new Error('Invalid recurrence duration.')
      if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error('Invalid recurrence limit.')

      const localStart = allDay
        ? startInstant.toISOString().slice(0, 10).replaceAll('-', '') + 'T000000Z'
        : compactLocalDateTime(formatInTimeZone(startInstant, timezone, 'yyyy-MM-dd HH:mm:ss'))
      const dtstartLine = allDay
        ? `DTSTART:${localStart}`
        : `DTSTART;TZID=${timezone}:${localStart}`
      const set = rrulestr([dtstartLine, ...normalizedLines].join('\n'), {
        compatible: true,
        forceset: true,
      })

      const wallRangeStart = allDay
        ? rangeStartInstant
        : new Date(`${formatInTimeZone(rangeStartInstant, timezone, 'yyyy-MM-dd HH:mm:ss')}Z`)
      const wallRangeEnd = allDay
        ? rangeEndInstant
        : new Date(`${formatInTimeZone(rangeEndInstant, timezone, 'yyyy-MM-dd HH:mm:ss')}Z`)
      const candidates = set.between(wallRangeStart, wallRangeEnd, true)
      const truncated = candidates.length > limit

      const occurrences = candidates.slice(0, limit).map((wallStart) => {
        const start = allDay
          ? wallStart
          : fromZonedTime(utcWallString(wallStart), timezone)
        const end = new Date(start.getTime() + durationMs)
        return {
          occurrenceKey: occurrenceKey({ start, timezone, allDay, formatInTimeZone }),
          start: start.toISOString(),
          end: end.toISOString(),
          originalStartTime: allDay ? null : start.toISOString(),
          originalStartDate: allDay ? start.toISOString().slice(0, 10) : null,
        }
      })

      return {
        occurrences,
        truncated,
        normalizedRecurrenceLines: normalizedLines,
      }
    },
  }
}
