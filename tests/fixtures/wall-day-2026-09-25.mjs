// Real-shaped data for Friday Sep 25 and Saturday Sep 26, 2026, mirroring what
// production held on 2026-09-25 (events, routines, members). Times are built in
// local time so tests behave the same in any time zone.

const local = (month, day, hour, minute) => new Date(2026, month - 1, day, hour, minute).toISOString()

export const FRIDAY = new Date(2026, 8, 25)
export const SATURDAY = new Date(2026, 8, 26)
export const TUESDAY = new Date(2026, 8, 29)
export const at = (day, hour, minute) => new Date(2026, 8, day, hour, minute)

export const members = [
  { id: 'jake-id', name: 'Jake', role: 'parent', can_drive: true, show_on_home_sidebar: true, sort_order: 1 },
  { id: 'kelly', name: 'Kelly', role: 'parent', can_drive: true, show_on_home_sidebar: true, sort_order: 2 },
  { id: 'liv', name: 'Liv', role: 'child', can_drive: false, show_on_home_sidebar: true, sort_order: 3 },
  { id: 'emme', name: 'Emme', role: 'child', can_drive: false, show_on_home_sidebar: true, sort_order: 4 },
  { id: 'owen', name: 'Owen', role: 'child', can_drive: false, show_on_home_sidebar: true, sort_order: 5 },
  { id: 'tabor', name: 'Tabor Family', role: 'child', can_drive: false, show_on_home_sidebar: false, sort_order: 5 },
  { id: 'giselle', name: 'Giselle', role: 'caregiver', can_drive: true, show_on_home_sidebar: true, sort_order: 7 },
]

const weekdays = [1, 2, 3, 4, 5]

export const routines = [
  {
    id: 'routine-liv', memberId: 'liv', title: 'School', routineType: 'school',
    venueName: 'Bak Middle School of the Arts', venueAddress: '', daysOfWeek: weekdays,
    startLocal: '08:00', endLocal: '15:30', dropoffDriverName: 'Kelly', pickupDriverName: 'Giselle', enabled: true,
  },
  {
    id: 'routine-emme', memberId: 'emme', title: 'School', routineType: 'school',
    venueName: 'Palm Beach Public Elementary School', venueAddress: '', daysOfWeek: weekdays,
    startLocal: '07:35', endLocal: '14:00', dropoffDriverName: 'Jake', dropoffDriverId: 'jake-id', pickupDriverName: 'Giselle', enabled: true,
    syncMode: 'exceptions_only',
    dayOverrides: [{ dayOfWeek: 2, label: 'Early Beethoven Strings', startLocal: '07:00', endLocal: '14:00', dropoffDriverName: 'Jake', dropoffDriverId: 'jake-id', pickupDriverName: 'Giselle', enabled: true }],
  },
  {
    id: 'routine-owen', memberId: 'owen', title: 'School', routineType: 'school',
    venueName: 'Palm Beach Public Elementary School', venueAddress: '', daysOfWeek: weekdays,
    startLocal: '07:35', endLocal: '14:00', dropoffDriverName: 'Jake', pickupDriverName: 'Giselle', enabled: true,
  },
]

const ferrinPark = 'Ferrin Park Field 1, 11921 Okeechobee Blvd, Royal Palm Beach, FL 33411'

export const events = [
  {
    id: 'photobook', title: 'Pick up Photobook for Liv', event_type: 'reminder', all_day: false,
    start_time: local(9, 25, 10, 25), end_time: local(9, 25, 10, 40), location_name: null, address: null,
    members: [{ family_member_id: 'jake-id', role: 'primary' }, { family_member_id: 'liv', role: 'attendee' }],
  },
  {
    id: 'spirit-day', title: "SAVE the DATE- PTO's Spirit Day - Friday, Sept 25th", event_type: 'reminder', all_day: false,
    start_time: local(9, 25, 14, 0), end_time: local(9, 25, 14, 15), location_name: null, address: null,
    members: [{ family_member_id: 'emme', role: 'primary' }],
  },
  {
    id: 'violin', title: 'Emme Practice Violin with Meredith', event_type: 'event', all_day: false,
    start_time: local(9, 25, 16, 30), end_time: local(9, 25, 17, 15), location_name: null, address: null,
    members: [{ family_member_id: 'emme', role: 'primary' }],
  },
  {
    id: 'birthday', title: "Kelly's Birthday", event_type: 'event', all_day: false,
    start_time: local(9, 26, 9, 0), end_time: local(9, 26, 10, 0), location_name: null, address: null,
    members: [{ family_member_id: 'kelly', role: 'primary' }],
  },
  {
    id: 'baseball', title: 'Baseball: Huskies @ RPB Cascade', event_type: 'event', all_day: false,
    start_time: local(9, 26, 12, 30), end_time: local(9, 26, 14, 30), location_name: ferrinPark, address: ferrinPark,
    members: [],
    // Production stored this departure with the wrong year (enrichment bug, found 2026-09-25).
    enrichment: { drive_time_mins: 25, departure_time: '2020-09-26T16:15:00+00:00' },
    plan_override: { transportation_plan: { legs: [
      { purpose: 'appointment', timing: 'arrive_by', time: '12:30', driverId: null, driverName: '' },
      { purpose: 'return', timing: 'depart_at', time: '14:30', driverId: null, driverName: '' },
    ] } },
  },
  {
    id: 'softball', title: 'Softball: Huskies @ RPB Cascade', event_type: 'event', all_day: false,
    start_time: local(9, 26, 12, 30), end_time: local(9, 26, 14, 30), location_name: ferrinPark, address: ferrinPark,
    members: [{ family_member_id: 'jake-id', role: 'attendee' }],
    enrichment: { drive_time_mins: 29, departure_time: local(9, 26, 11, 56) },
    plan_override: { transportation_plan: { legs: [
      { purpose: 'appointment', timing: 'arrive_by', time: '12:30', driverId: 'jake-id', driverName: 'Jake' },
      { purpose: 'return', timing: 'depart_at', time: '14:30', driverId: 'jake-id', driverName: 'Jake' },
    ] } },
  },
  {
    // Google-synced copy of Emme's Tuesday routine exception (as stored in production).
    id: 'strings-mirror', title: 'Drop off Emme @ Palm Beach Public Elementary School · Early Beethoven Strings', event_type: 'event', all_day: false,
    start_time: local(9, 29, 7, 0), end_time: local(9, 29, 7, 15),
    location_name: 'Palm Beach Public Elementary School', address: null,
    members: [],
  },
]
