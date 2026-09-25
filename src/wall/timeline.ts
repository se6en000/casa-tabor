export const DAY_START_HOUR = 7
export const DAY_END_HOUR = 21
export const TIMELINE_WIDTH = 1512

function localHours(date: Date): number {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
}

/** Horizontal position on the Score for a moment today (local time), clamped to 7 AM–9 PM. */
export function xForTime(date: Date): number {
  const hours = Math.min(Math.max(localHours(date), DAY_START_HOUR), DAY_END_HOUR)
  return ((hours - DAY_START_HOUR) / (DAY_END_HOUR - DAY_START_HOUR)) * TIMELINE_WIDTH
}

export function isOnTimeline(date: Date): boolean {
  const hours = localHours(date)
  return hours >= DAY_START_HOUR && hours <= DAY_END_HOUR
}

export interface HourMark {
  hour: number
  label: string
  x: number
}

export function hourMarks(): HourMark[] {
  const marks: HourMark[] = []
  for (let hour = DAY_START_HOUR; hour <= DAY_END_HOUR; hour += 1) {
    const twelve = hour % 12 === 0 ? 12 : hour % 12
    const suffix = hour === DAY_START_HOUR || hour === DAY_END_HOUR || hour === 12 ? (hour < 12 ? ' AM' : ' PM') : ''
    marks.push({
      hour,
      label: `${twelve}${suffix}`,
      x: ((hour - DAY_START_HOUR) / (DAY_END_HOUR - DAY_START_HOUR)) * TIMELINE_WIDTH,
    })
  }
  return marks
}
