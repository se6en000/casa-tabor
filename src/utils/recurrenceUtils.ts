import { format } from 'date-fns'

export type RecurrenceFrequency = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
export type RecurrenceEndType = 'never' | 'date' | 'count'

export interface RecurrenceConfig {
  freq: RecurrenceFrequency
  interval: number
  byDay: number[] // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  endType: RecurrenceEndType
  endDate: string // YYYY-MM-DD
  count: number
}

export const DEFAULT_RECURRENCE_CONFIG: RecurrenceConfig = {
  freq: 'none',
  interval: 1,
  byDay: [],
  endType: 'never',
  endDate: '',
  count: 10,
}

const DAY_NAMES_BY_INDEX = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const INDEX_BY_DAY_NAME: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const FULL_DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * Parse an RFC 5545 RRULE string into structured RecurrenceConfig.
 */
export function parseRrule(rruleStr: string | null | undefined): RecurrenceConfig {
  if (!rruleStr || typeof rruleStr !== 'string' || !rruleStr.trim()) {
    return { ...DEFAULT_RECURRENCE_CONFIG }
  }

  const cleanRule = rruleStr.replace(/^RRULE:/i, '').trim()
  const get = (key: string): string => {
    const match = cleanRule.match(new RegExp(`(?:^|;)${key}=([^;]+)`))
    return match ? match[1] : ''
  }

  const freqRaw = get('FREQ').toUpperCase()
  const freqMap: Record<string, RecurrenceFrequency> = {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
    YEARLY: 'yearly',
  }
  const freq = freqMap[freqRaw] || 'none'
  if (freq === 'none') {
    return { ...DEFAULT_RECURRENCE_CONFIG }
  }

  const intervalRaw = parseInt(get('INTERVAL'), 10)
  const interval = Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : 1

  const byDayRaw = get('BYDAY')
  const byDay: number[] = byDayRaw
    ? byDayRaw
        .split(',')
        .map((d) => INDEX_BY_DAY_NAME[d.trim().toUpperCase()])
        .filter((d): d is number => d !== undefined)
    : []

  const untilRaw = get('UNTIL')
  const countRaw = get('COUNT')

  let endType: RecurrenceEndType = 'never'
  let endDate = ''
  let count = 10

  if (countRaw) {
    endType = 'count'
    const parsedCount = parseInt(countRaw, 10)
    count = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 10
  } else if (untilRaw) {
    endType = 'date'
    // UNTIL format: YYYYMMDD or YYYYMMDDTHHMMSSZ
    const match = untilRaw.match(/^(\d{4})(\d{2})(\d{2})/)
    if (match) {
      endDate = `${match[1]}-${match[2]}-${match[3]}`
    }
  }

  return {
    freq,
    interval,
    byDay,
    endType,
    endDate,
    count,
  }
}

/**
 * Build an RFC 5545 RRULE string from a RecurrenceConfig.
 */
export function buildRrule(config: RecurrenceConfig): string | null {
  if (!config || config.freq === 'none') {
    return null
  }

  const parts: string[] = [`FREQ=${config.freq.toUpperCase()}`]

  if (config.interval > 1) {
    parts.push(`INTERVAL=${config.interval}`)
  }

  if (config.freq === 'weekly' && config.byDay.length > 0) {
    const sortedDays = [...config.byDay].sort((a, b) => a - b)
    const dayCodes = sortedDays.map((d) => DAY_NAMES_BY_INDEX[d]).filter(Boolean)
    if (dayCodes.length > 0) {
      parts.push(`BYDAY=${dayCodes.join(',')}`)
    }
  }

  if (config.endType === 'date' && config.endDate) {
    const compactDate = config.endDate.replace(/-/g, '')
    parts.push(`UNTIL=${compactDate}T235959Z`)
  } else if (config.endType === 'count' && config.count > 0) {
    parts.push(`COUNT=${config.count}`)
  }

  return parts.join(';')
}

/**
 * Format a human-readable summary of the recurrence schedule.
 */
export function formatRecurrenceSummary(
  config: RecurrenceConfig,
  referenceDate: Date = new Date()
): string {
  if (!config || config.freq === 'none') {
    return 'Does not repeat (One-time event)'
  }

  const { freq, interval, byDay, endType, endDate, count } = config
  let freqSummary = ''

  if (freq === 'daily') {
    freqSummary = interval === 1 ? 'Repeats daily' : `Repeats every ${interval} days`
  } else if (freq === 'weekly') {
    const effectiveDays = byDay.length > 0 ? byDay : [referenceDate.getDay()]
    const isWeekdays =
      effectiveDays.length === 5 &&
      [1, 2, 3, 4, 5].every((d) => effectiveDays.includes(d))
    const isWeekends =
      effectiveDays.length === 2 &&
      [0, 6].every((d) => effectiveDays.includes(d))
    const isAllDays = effectiveDays.length === 7

    let dayString = ''
    if (isAllDays) {
      dayString = 'every day'
    } else if (isWeekdays) {
      dayString = 'on weekdays'
    } else if (isWeekends) {
      dayString = 'on weekends'
    } else if (effectiveDays.length === 1) {
      dayString = `on ${FULL_DAY_LABELS[effectiveDays[0]]}`
    } else {
      const sorted = [...effectiveDays].sort((a, b) => a - b)
      dayString = `on ${sorted.map((d) => DAY_LABELS[d]).join(', ')}`
    }

    if (interval === 1) {
      freqSummary = isAllDays ? 'Repeats every day' : `Repeats weekly ${dayString}`
    } else if (interval === 2) {
      freqSummary = `Repeats every 2 weeks ${dayString}`
    } else {
      freqSummary = `Repeats every ${interval} weeks ${dayString}`
    }
  } else if (freq === 'monthly') {
    const dayOfMonth = referenceDate.getDate()
    const ordinalSuffix = (n: number) => {
      const s = ['th', 'st', 'nd', 'rd']
      const v = n % 100
      return n + (s[(v - 20) % 10] || s[v] || s[0])
    }
    if (interval === 1) {
      freqSummary = `Repeats monthly on the ${ordinalSuffix(dayOfMonth)}`
    } else {
      freqSummary = `Repeats every ${interval} months on the ${ordinalSuffix(dayOfMonth)}`
    }
  } else if (freq === 'yearly') {
    const monthName = format(referenceDate, 'MMMM')
    const dayOfMonth = referenceDate.getDate()
    if (interval === 1) {
      freqSummary = `Repeats yearly on ${monthName} ${dayOfMonth}`
    } else {
      freqSummary = `Repeats every ${interval} years on ${monthName} ${dayOfMonth}`
    }
  }

  // End condition summary
  let endSummary = ''
  if (endType === 'date' && endDate) {
    try {
      const [y, m, d] = endDate.split('-').map(Number)
      if (y && m && d) {
        const formattedEndDate = format(new Date(y, m - 1, d), 'MMM d, yyyy')
        endSummary = `, until ${formattedEndDate}`
      }
    } catch {
      endSummary = `, until ${endDate}`
    }
  } else if (endType === 'count' && count > 0) {
    endSummary = `, for ${count} times`
  }

  return `${freqSummary}${endSummary}`
}

/**
 * Short badge label for compact action chips in the meta cluster.
 */
export function formatRecurrencePillLabel(
  config: RecurrenceConfig,
  referenceDate: Date = new Date()
): string {
  if (!config || config.freq === 'none') {
    return 'Does not repeat'
  }

  const { freq, interval, byDay } = config
  if (freq === 'daily') {
    return interval === 1 ? 'Daily' : `Every ${interval}d`
  }
  if (freq === 'weekly') {
    const effectiveDays = byDay.length > 0 ? byDay : [referenceDate.getDay()]
    if (effectiveDays.length === 5 && [1, 2, 3, 4, 5].every((d) => effectiveDays.includes(d))) {
      return interval === 1 ? 'Weekdays' : `Every ${interval} wks (M-F)`
    }
    if (effectiveDays.length === 1) {
      const dayName = DAY_LABELS[effectiveDays[0]]
      return interval === 1 ? `Weekly on ${dayName}` : `Every ${interval} wks (${dayName})`
    }
    if (effectiveDays.length <= 3) {
      const sorted = [...effectiveDays].sort((a, b) => a - b)
      const dayStr = sorted.map((d) => DAY_LABELS[d]).join(', ')
      return interval === 1 ? `Weekly (${dayStr})` : `Every ${interval}w (${dayStr})`
    }
    return interval === 1 ? 'Weekly' : `Every ${interval} wks`
  }
  if (freq === 'monthly') {
    return interval === 1 ? 'Monthly' : `Every ${interval} mos`
  }
  if (freq === 'yearly') {
    return interval === 1 ? 'Yearly' : `Every ${interval} yrs`
  }
  return 'Repeats'
}

/**
 * Expand an RRULE into occurrence {start, end} pairs for local database caching / synchronization.
 * Excludes the master (first) occurrence.
 */
export function expandRruleInstances(
  masterStart: string,
  masterEnd: string,
  rrule: string,
  maxOccurrences: number = 24
): Array<{ start: string; end: string }> {
  const parsed = parseRrule(rrule)
  if (parsed.freq === 'none') return []

  const origin = new Date(masterStart)
  const masterEndTime = new Date(masterEnd)
  const durationMs = masterEndTime.getTime() - origin.getTime()
  const results: Array<{ start: string; end: string }> = []

  let untilDate: Date | null = null
  if (parsed.endType === 'date' && parsed.endDate) {
    const [y, m, d] = parsed.endDate.split('-').map(Number)
    if (y && m && d) {
      untilDate = new Date(y, m - 1, d, 23, 59, 59, 999)
    }
  }

  const limitCount = parsed.endType === 'count' ? Math.min(parsed.count, maxOccurrences + 1) : maxOccurrences + 1

  const addOccurrence = (targetDate: Date): boolean => {
    if (results.length >= Math.min(limitCount - 1, maxOccurrences)) return false
    if (untilDate && targetDate > untilDate) return false
    if (targetDate.toDateString() === origin.toDateString()) return true // skip master day

    const start = new Date(targetDate)
    start.setHours(origin.getHours(), origin.getMinutes(), origin.getSeconds(), origin.getMilliseconds())
    const end = new Date(start.getTime() + durationMs)

    results.push({
      start: start.toISOString(),
      end: end.toISOString(),
    })
    return true
  }

  const { freq, interval, byDay } = parsed

  if (freq === 'daily') {
    const cur = new Date(origin)
    cur.setDate(cur.getDate() + interval)
    while ((untilDate ? cur <= untilDate : results.length < limitCount - 1) && results.length < maxOccurrences) {
      if (!addOccurrence(cur)) break
      cur.setDate(cur.getDate() + interval)
    }
  } else if (freq === 'weekly') {
    const effectiveByDay = byDay.length > 0 ? byDay : [origin.getDay()]
    const weekSun = new Date(origin)
    weekSun.setDate(origin.getDate() - origin.getDay())
    let weekOffset = 0
    const maxWeeks = 16

    outer: while (weekOffset < maxWeeks && results.length < maxOccurrences) {
      const ws = new Date(weekSun)
      ws.setDate(weekSun.getDate() + weekOffset * 7 * interval)
      const sorted = [...effectiveByDay].sort((a, b) => a - b)
      for (const d of sorted) {
        const day = new Date(ws)
        day.setDate(ws.getDate() + d)
        if (day < origin) continue
        if (untilDate && day > untilDate) break outer
        if (results.length >= Math.min(limitCount - 1, maxOccurrences)) break outer
        addOccurrence(day)
      }
      weekOffset++
    }
  } else if (freq === 'monthly') {
    let monthOffset = interval
    const maxMonths = 24
    while (monthOffset <= maxMonths && results.length < maxOccurrences) {
      const nextMonth = new Date(origin)
      nextMonth.setMonth(origin.getMonth() + monthOffset)
      if (untilDate && nextMonth > untilDate) break
      if (!addOccurrence(nextMonth)) break
      monthOffset += interval
    }
  } else if (freq === 'yearly') {
    let yearOffset = interval
    const maxYears = 5
    while (yearOffset <= maxYears && results.length < maxOccurrences) {
      const nextYear = new Date(origin)
      nextYear.setFullYear(origin.getFullYear() + yearOffset)
      if (untilDate && nextYear > untilDate) break
      if (!addOccurrence(nextYear)) break
      yearOffset += interval
    }
  }

  return results
}
