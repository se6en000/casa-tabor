import type { QueryClient } from '@tanstack/react-query'
import { invalidateAllCalendarQueries } from '../lib/eventMutations'
import { supabase } from '../lib/supabase'
import { withNotes } from '../../supabase/functions/_shared/event-notes.mjs'
import type { WallEvent } from './engine/types'

/**
 * An event's or reminder's notes, saved from the wall or the phone (canvas 65): only what people wrote changes —
 * the house's tags and the details block Google gets stay. Read fresh, so a sync since the sheet opened isn't lost;
 * then Google gets these notes (not its own copy). Reminders stay in Tabor House, so nothing goes to Google for them.
 */
export async function saveEventNotes(queryClient: QueryClient, event: Pick<WallEvent, 'id' | 'event_type'>, notes: string): Promise<void> {
  const { data, error: readError } = await supabase.from('events').select('description').eq('id', event.id).maybeSingle()
  if (readError) throw readError
  const description = withNotes((data as { description?: string | null } | null)?.description ?? null, notes)
  const { error } = await supabase.from('events').update({ description, updated_at: new Date().toISOString() }).eq('id', event.id)
  if (error) throw error
  invalidateAllCalendarQueries(queryClient, event.id)
  void queryClient.invalidateQueries({ queryKey: ['todos'] })
  if (event.event_type !== 'reminder') {
    void supabase.functions.invoke('sync-event-to-google', { body: { event_id: event.id, notes: true, enqueue_on_failure: true } }).catch(() => {})
  }
}
