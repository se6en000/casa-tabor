import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { WallChore } from './engine/chores'

// Saving a chore from its sheet (canvas 20b): its own table, never synced to Google; the wall re-reads at once.

export async function saveChore(queryClient: QueryClient, chore: WallChore): Promise<void> {
  const row = {
    title: chore.title, member_id: chore.member_id, for_member_id: chore.for_member_id, days_of_week: chore.days_of_week,
    time_local: chore.time_local, minutes: chore.minutes, enabled: chore.enabled, every_weeks: chore.every_weeks, starts_on: chore.starts_on,
    updated_at: new Date().toISOString(),
  }
  const { error } = chore.id
    ? await supabase.from('household_chores').update(row).eq('id', chore.id)
    : await supabase.from('household_chores').insert(row)
  if (error) throw error
  await queryClient.invalidateQueries({ queryKey: ['household-chores'] })
}

export async function deleteChore(queryClient: QueryClient, id: string): Promise<void> {
  const { error } = await supabase.from('household_chores').delete().eq('id', id)
  if (error) throw error
  await queryClient.invalidateQueries({ queryKey: ['household-chores'] })
}
