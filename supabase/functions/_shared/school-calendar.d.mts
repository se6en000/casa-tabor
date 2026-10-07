export interface SchoolDayOff { from: string; to: string; name: string }
export const SCHOOL_DISTRICT: string
export const SCHOOL_YEARS: Array<{ year: string; first: string; last: string; off: SchoolDayOff[] }>
export const SCHOOL_CALENDAR_UNTIL: string
export function schoolDaysOff(fromYmd: string, toYmd: string): Array<SchoolDayOff & { schoolDays: number }>
export function weekdaysBetween(a: string, b: string): number
export function isLongBreak(o: SchoolDayOff): boolean
export function rangeWords(from: string, to: string): string
export function federalHolidays(year: number): Array<{ name: string; ymd: string }>
export function holidaysSection(todayYmd: string, months?: number): string | null
