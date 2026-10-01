import type { QueryClient } from '@tanstack/react-query'
import type { FamilyRoutine } from '../lib/familyRoutines'
import type { Known } from './PersonPage'

// Row 16 in the fixtures: the parents' working hours as Work routines (as the live rows read), a few days off,
// and what Casa knows about Owen (canvas 16c), seeded where the casa-memory function would answer.

export const WORK_ROUTINES: FamilyRoutine[] = [
  { key: 'work-hours', memberId: 'jake-id', title: 'Work', routineType: 'work', venueName: '', venueAddress: '', daysOfWeek: [1, 2, 3, 4, 5], startLocal: '09:00', endLocal: '17:00', dayOverrides: [], dropoffDriverName: '', pickupDriverName: '', syncMode: 'none', syncToGoogle: false, enabled: true },
  { key: 'work-hours', memberId: 'kelly', title: 'Work', routineType: 'work', venueName: '', venueAddress: '', daysOfWeek: [1, 2, 3, 4, 5], startLocal: '07:30', endLocal: '18:30', dayOverrides: [], dropoffDriverName: '', pickupDriverName: '', syncMode: 'none', syncToGoogle: false, enabled: true },
]

export const FIXTURE_DAY_OFFS = [
  { id: 'off-1', member_id: 'owen', override_type: 'day_off', start_at: new Date(2026, 9, 12, 0, 0).toISOString(), end_at: new Date(2026, 9, 12, 23, 59).toISOString() },
  { id: 'off-2', member_id: 'owen', override_type: 'day_off', start_at: new Date(2026, 10, 11, 0, 0).toISOString(), end_at: new Date(2026, 10, 11, 23, 59).toISOString() },
]

export const OWEN_KNOWN: Known = {
  sure: [
    { id: 'k1', text: 'In kindergarten at Palm Beach Public', from: 'you said it' },
    { id: 'k2', text: 'His teacher is Mrs. Rosangela (Rose) Paine; the class is K by the Sea', from: '23 emails from her' },
    { id: 'k3', text: 'ABA therapy at Hope Center for Behavior Change, with Towhid Nishat', from: '8 emails; Hope Center on the calendar' },
    { id: 'k4', text: 'Pediatric dentist: Wanuck, Hier & Associates', from: 'your old contacts, confirmed' },
    { id: 'k5', text: 'Haircuts at Sharkey’s Cuts for Kids, Boynton Beach', from: 'your old contacts, confirmed' },
  ],
  notSure: [{ id: 'k6', text: 'A school contact: Preservation Foundation of Palm Beach?', from: 'your old contacts' }],
}

/** Seeds what Casa knows, so the person pages show it with no network. */
export function seedKnown(queryClient: QueryClient) {
  queryClient.setQueryData(['person-known', 'owen'], OWEN_KNOWN)
  for (const id of ['jake-id', 'kelly', 'liv', 'emme', 'giselle']) queryClient.setQueryData(['person-known', id], { sure: [], notSure: [] })
}
