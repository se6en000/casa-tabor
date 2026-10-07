import type { QueryClient } from '@tanstack/react-query'
import { MAIN_ROUTINE_KEY, serializeRoutineToAvailabilityRules, syncMemberRoutineExceptions, type FamilyRoutine } from '../lib/familyRoutines'
import { supabase } from '../lib/supabase'
import type { FamilyMember } from '../types'

// Saving a routine from the person's page (canvas 16d): only that routine's rows are replaced, in one
// transaction (casa_routine_save), so the person's other routines stay as they were.

const refresh = async (qc: QueryClient) => {
  await Promise.all(['member-availability-rules', 'member-availability-exceptions', 'events', 'today-events', 'tomorrow-events', 'rolling-events']
    .map((key) => qc.invalidateQueries({ queryKey: [key] })))
}

export async function saveRoutine(qc: QueryClient, routine: FamilyRoutine, members: FamilyMember[]): Promise<void> {
  const key = routine.key ?? MAIN_ROUTINE_KEY
  const rows = routine.enabled && routine.daysOfWeek.length > 0 ? serializeRoutineToAvailabilityRules({ ...routine, key }) : []
  const { error } = await supabase.rpc('casa_routine_save', { p_member: routine.memberId, p_key: key, p_rows: rows })
  if (error) throw new Error('Saving didn’t work. Nothing was changed.')
  // The school runs' calendar copies follow the main routine, as the old Settings page does.
  if (key === MAIN_ROUTINE_KEY && rows.length > 0) void syncMemberRoutineExceptions(supabase, routine.memberId, routine, members)
  await refresh(qc)
}

export async function removeRoutine(qc: QueryClient, routine: FamilyRoutine): Promise<void> {
  const { error } = await supabase.rpc('casa_routine_save', { p_member: routine.memberId, p_key: routine.key ?? MAIN_ROUTINE_KEY, p_rows: [] })
  if (error) throw new Error('Removing didn’t work. Nothing was changed.')
  await refresh(qc)
}

/** A day off for the person (no school, no work): the whole day, in the family's time zone. */
export async function addDayOff(qc: QueryClient, memberId: string, ymd: string, note = 'Day off', until = ymd): Promise<void> {
  const [y, m, d] = ymd.split('-').map(Number)
  const [uy, um, ud] = until.split('-').map(Number)
  const start = new Date(y, m - 1, d, 0, 0, 0)
  // A break is one day off from its first day to its last (isDayOff reads the range).
  const end = new Date(uy, um - 1, ud, 23, 59, 0)
  const { error } = await supabase.from('member_availability_exceptions').insert({
    member_id: memberId, start_at: start.toISOString(), end_at: end.toISOString(), override_type: 'day_off', note,
  })
  if (error) throw new Error('That day off didn’t save.')
  await refresh(qc)
}

export async function removeDayOff(qc: QueryClient, id: string): Promise<void> {
  const { error } = await supabase.from('member_availability_exceptions').delete().eq('id', id)
  if (error) throw new Error('That day off wasn’t removed.')
  await refresh(qc)
}

/** Who has them on a day off ("Columbus Day · Giselle has them"), kept on the day off itself — Alexa reads it (Oct 7). */
export async function setDayOffCover(qc: QueryClient, memberIds: string[], ymd: string, note: string): Promise<void> {
  const [y, m, d] = ymd.split('-').map(Number)
  const from = new Date(y, m - 1, d, 0, 0, 0).toISOString()
  const to = new Date(y, m - 1, d, 23, 59, 59).toISOString()
  const { error } = await supabase.from('member_availability_exceptions').update({ note })
    .in('member_id', memberIds).eq('override_type', 'day_off').gte('start_at', from).lte('start_at', to)
  if (error) throw new Error('That didn’t save.')
  await refresh(qc)
}
