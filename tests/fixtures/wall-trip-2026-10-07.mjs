// Jake's real Dallas trip (Oct 7–8, 2026) as Casa holds it: the two flights the work email brought in and the
// hotel's all-day "trip" event, on top of the family's usual routines (Jake drops Emme & Owen at 7:35).
import { members, routines } from './wall-day-2026-09-25.mjs'

const local = (month, day, hour, minute) => new Date(2026, month - 1, day, hour, minute).toISOString()
const jake = [{ family_member_id: 'jake-id', role: 'primary' }]

export const WEDNESDAY = new Date(2026, 9, 7)
export const THURSDAY = new Date(2026, 9, 8)
export const FRIDAY = new Date(2026, 9, 9)
export const on = (day, hour, minute) => new Date(2026, 9, day, hour, minute)
export { members, routines }

export const tripEvents = [
  {
    id: 'f1419', title: 'TABOR JACOB | Flight 1419 DJT→DFW', event_type: 'event', all_day: false,
    start_time: local(10, 7, 14, 13), end_time: local(10, 7, 16, 30),
    location_name: 'Verizon Corporate Office', address: '600 Hidden Ridge, Irving, TX 75038, USA', members: jake,
  },
  {
    id: 'f2640', title: 'TABOR JACOB | Flight 2640 DFW→DJT', event_type: 'event', all_day: false,
    start_time: local(10, 8, 14, 45), end_time: local(10, 8, 18, 34), location_name: 'DJT', address: null, members: jake,
  },
  {
    id: 'trip-dallas', title: 'JRT Trip Dallas', event_type: 'event', all_day: true,
    start_time: local(10, 7, 0, 0), end_time: local(10, 8, 23, 59), location_name: 'Courtyard by Marriott Dallas Allen',
    address: '210 East Stacy Road, Allen, Texas, 75002', members: jake,
  },
]

export const travelPrefs = { 'jake-id': { airportMinutes: 60, way: 'uber' }, kelly: { airportMinutes: 120 } }

// A work trip by car (Jake: "driving for a work trip is good too since I do that"), as Casa adds it from a conversation.
export const driveEvents = [
  { id: 'd-out', title: 'Drive to Orlando', event_type: 'event', all_day: false, start_time: local(10, 13, 6, 30), end_time: local(10, 13, 9, 45), location_name: null, address: null, members: jake },
  { id: 'd-home', title: 'Drive home from Orlando', event_type: 'event', all_day: false, start_time: local(10, 15, 16, 0), end_time: local(10, 15, 19, 15), location_name: null, address: null, members: jake },
  { id: 'd-trip', title: 'Trip Orlando', event_type: 'event', all_day: true, start_time: local(10, 13, 0, 0), end_time: local(10, 15, 23, 59), location_name: 'Hyatt Regency Orlando', address: null, members: jake },
]
