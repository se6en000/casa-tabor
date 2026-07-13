import { format } from 'date-fns'

function dateOnly(value: string): string {
  return String(value ?? '').slice(0, 10)
}

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOnly(value))
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0)
}

function toUtcIsoFromDate(date: Date, endOfDay: boolean): string {
  return new Date(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 0 : 0,
  )).toISOString()
}

function compareDateOnly(a: string, b: string): number {
  return dateOnly(a).localeCompare(dateOnly(b))
}

export function normalizeAllDayEventRange(startValue: string, endValue: string): { start: string; end: string } {
  const start = parseDateOnly(startValue) ?? new Date(startValue)
  const end = parseDateOnly(endValue) ?? new Date(endValue)
  if (Number.isNaN(start.getTime())) {
    return {
      start: new Date(startValue).toISOString(),
      end: new Date(startValue).toISOString(),
    }
  }
  const safeEnd = Number.isNaN(end.getTime()) || compareDateOnly(endValue, startValue) < 0 ? start : end
  return {
    start: toUtcIsoFromDate(start, false),
    end: toUtcIsoFromDate(safeEnd, true),
  }
}

export function formatAllDayRangeLabel(startValue: string, endValue: string): string {
  const start = parseDateOnly(startValue) ?? new Date(startValue)
  const end = parseDateOnly(endValue) ?? new Date(endValue)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'All day'
  const startLabel = format(start, 'EEE, MMM d')
  const endLabel = format(end, 'EEE, MMM d')
  return startLabel === endLabel ? `${startLabel} · All day` : `${startLabel} – ${endLabel} · All day`
}
