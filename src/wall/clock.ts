export function msUntilNextMinute(now: Date): number {
  const elapsed = now.getSeconds() * 1000 + now.getMilliseconds()
  return elapsed === 0 ? 60_000 : 60_000 - elapsed
}

export interface ClockParts {
  time: string
  meridiem: string
}

export function formatWallClock(now: Date, timeZone?: string): ClockParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return { time: `${part('hour')}:${part('minute')}`, meridiem: part('dayPeriod').toUpperCase() }
}

export function formatWallDate(now: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone }).format(now)
}
