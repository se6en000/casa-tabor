export type RecurrenceFrequency = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
export type RecurrenceEndType = 'never' | 'date' | 'count'

export interface RecurrenceRuleState {
  freq: RecurrenceFrequency
  interval: number
  byDay: number[] // 0=Sun, 1=Mon, ..., 6=Sat
  endType: RecurrenceEndType
  endDate: string // YYYY-MM-DD
  count: number
}

export const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const
export const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

export function parseRrule(rruleStr: string | null): RecurrenceRuleState {
  if (!rruleStr) {
    return { freq: 'none', interval: 1, byDay: [], endType: 'never', endDate: '', count: 1 }
  }

  const clean = rruleStr.replace(/^RRULE:/, '')
  const get = (key: string) => clean.match(new RegExp(`${key}=([^;]+)`))?.[1] ?? ''

  const freqMap: Record<string, RecurrenceFrequency> = {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
    YEARLY: 'yearly',
  }
  const freq = freqMap[get('FREQ')] ?? 'none'
  const interval = Math.max(1, parseInt(get('INTERVAL') || '1', 10))

  const byDayRaw = get('BYDAY')
  const byDayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }
  const byDay = byDayRaw
    ? byDayRaw.split(',').filter(Boolean).map(d => byDayMap[d] ?? -1).filter(d => d >= 0)
    : []

  const until = get('UNTIL')
  const countStr = get('COUNT')
  const endType: RecurrenceEndType = countStr ? 'count' : until ? 'date' : 'never'
  const endDate = until
    ? `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`
    : ''
  const count = countStr ? Math.max(1, parseInt(countStr, 10)) : 1

  return { freq, interval, byDay, endType, endDate, count }
}

export function buildRruleString(state: RecurrenceRuleState): string | null {
  if (state.freq === 'none') return null

  let r = `FREQ=${state.freq.toUpperCase()}`
  if (state.interval > 1) {
    r += `;INTERVAL=${state.interval}`
  }
  if (state.freq === 'weekly' && state.byDay.length > 0) {
    r += `;BYDAY=${state.byDay.sort((a, b) => a - b).map(d => DAY_CODES[d]).join(',')}`
  }
  if (state.endType === 'date' && state.endDate) {
    const cleanDate = state.endDate.replace(/-/g, '')
    r += `;UNTIL=${cleanDate}T235959Z`
  } else if (state.endType === 'count' && state.count > 1) {
    r += `;COUNT=${state.count}`
  }

  return `RRULE:${r}`
}

export function buildRruleSummary(state: RecurrenceRuleState): string {
  if (state.freq === 'none') return 'Does not repeat'

  const intervalLabel = state.interval > 1 ? `every ${state.interval} ` : 'every '
  let base = ''

  if (state.freq === 'daily') {
    base = state.interval > 1 ? `Repeats every ${state.interval} days` : 'Repeats daily'
  } else if (state.freq === 'weekly') {
    if (state.byDay.length === 5 && [1, 2, 3, 4, 5].every(d => state.byDay.includes(d))) {
      base = 'Repeats every weekday (Mon–Fri)'
    } else if (state.byDay.length > 0) {
      const daysStr = state.byDay
        .sort((a, b) => a - b)
        .map(d => DAY_NAMES_SHORT[d])
        .join(', ')
      base = `Repeats ${intervalLabel}week on ${daysStr}`
    } else {
      base = `Repeats ${intervalLabel}week`
    }
  } else if (state.freq === 'monthly') {
    base = `Repeats ${intervalLabel}month`
  } else if (state.freq === 'yearly') {
    base = `Repeats ${intervalLabel}year`
  }

  if (state.endType === 'date' && state.endDate) {
    base += ` until ${state.endDate}`
  } else if (state.endType === 'count' && state.count > 1) {
    base += ` for ${state.count} occurrences`
  }

  return base
}
