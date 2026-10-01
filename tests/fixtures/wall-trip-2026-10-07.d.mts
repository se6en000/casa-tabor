// Types for the trip fixture, so the visual-test fixture page can import it.
export { members, routines } from './wall-day-2026-09-25.mjs'
export declare const WEDNESDAY: Date
export declare const THURSDAY: Date
export declare const FRIDAY: Date
export declare function on(day: number, hour: number, minute: number): Date
export declare const tripEvents: Array<Record<string, unknown>>
export declare const travelPrefs: Record<string, { airportMinutes?: number; way?: 'uber' | 'someone' | 'drive_park' }>
